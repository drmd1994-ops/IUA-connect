import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { type Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type StoredFile } from '../../generated/prisma/client';
import { SecretHasher } from '../../infra/crypto/secrets';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MalwareScanner } from '../../infra/storage/malware-scanner';
import { type ByteRange, ObjectStorage } from '../../infra/storage/object-storage';
import { AuditService } from '../audit';
import {
  CHAT_FILE_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  FileRejected,
  type Purpose,
  SNIFF_BYTES,
  cleanName,
  isMp4,
  prepareUpload,
} from './file-processing';
import { FileUrlSigner, type Variant } from './file-url';

export interface FileView {
  id: string;
  kind: 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/**
 * Decides whether a caller may read a file used by some content. Content modules register one
 * (news, guidelines, …): it returns true or false for files it knows, and null for the rest.
 */
export interface FileReadRule {
  canRead(fileId: string, principal: Principal | null): Promise<boolean | null>;
}

/**
 * Uploads, signed downloads and access checks (M3 plan §2.1, §4). Everyone may read a file they
 * uploaded; staff who may upload may read any file; otherwise a registered content rule decides
 * (e.g. a public article's image is public). Nothing else is readable.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly signer: FileUrlSigner;
  private readonly rules: FileReadRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
    hasher: SecretHasher,
  ) {
    this.signer = new FileUrlSigner(hasher);
  }

  registerReadRule(rule: FileReadRule): void {
    this.rules.push(rule);
  }

  async upload(
    input: { buffer: Buffer; originalname: string } | undefined,
    purpose: Purpose,
    ownerUserId: string,
    meta: RequestMeta,
  ): Promise<FileView> {
    if (!input)
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileMissing' }]);
    let prepared;
    try {
      prepared = await prepareUpload(input.buffer, input.originalname, purpose);
    } catch (error) {
      if (error instanceof FileRejected) {
        throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: error.code }]);
      }
      throw error;
    }
    const scanStatus = await this.scanner.scan(prepared.body);
    if (scanStatus === 'INFECTED') {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileInfected' }]);
    }

    const id = uuidv7();
    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const storageKey = `${folder}/${id}`;
    const thumbnailKey = prepared.thumbnail ? `${storageKey}.thumb` : null;
    await this.storage.put(storageKey, prepared.body, prepared.mimeType);
    if (thumbnailKey) await this.storage.put(thumbnailKey, prepared.thumbnail!, prepared.mimeType);
    const row = await this.prisma.storedFile.create({
      data: {
        id,
        storageKey,
        thumbnailKey,
        originalName: prepared.originalName,
        mimeType: prepared.mimeType,
        kind: prepared.kind,
        purpose,
        sizeBytes: prepared.body.length,
        sha256: prepared.sha256,
        width: prepared.width,
        height: prepared.height,
        scanStatus,
        ownerUserId,
      },
    });
    await this.audit.record({
      action: 'file.upload',
      correlationId: meta.correlationId,
      actorUserId: ownerUserId,
      actorIp: meta.ip,
      entityType: 'file',
      entityId: id,
      changes: { kind: row.kind, mimeType: row.mimeType, sizeBytes: row.sizeBytes, purpose },
    });
    return view(row);
  }

  /**
   * A file to send in a chat message, which the upload wrote to a temporary file: a JPEG or
   * PNG picture or a PDF (10 MB), or an MP4 video (100 MB). What it is comes from its first
   * bytes. The temporary file is the caller's to remove.
   */
  async uploadForChat(
    input: { path: string; originalname: string; size: number },
    ownerUserId: string,
    meta: RequestMeta,
  ): Promise<FileView> {
    const handle = await open(input.path, 'r');
    const head = Buffer.alloc(Math.min(SNIFF_BYTES, input.size));
    try {
      await handle.read(head, 0, head.length, 0);
    } finally {
      await handle.close();
    }
    if (await isMp4(head)) return this.uploadVideo(input, ownerUserId, meta);
    if (input.size > CHAT_FILE_MAX_BYTES) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileTooLarge' }]);
    }
    return this.upload(
      { buffer: await readFile(input.path), originalname: input.originalname },
      'CHAT',
      ownerUserId,
      meta,
    );
  }

  /**
   * Stores an MP4 video that the upload wrote to a temporary file (M13). It is kept as it was
   * sent: nothing in it is re-made, so whatever the camera wrote into it stays. It is never
   * read into memory, and so it is not handed to the malware scanner (marked UNSCANNED).
   */
  async uploadVideo(
    input: { path: string; originalname: string; size: number },
    ownerUserId: string,
    meta: RequestMeta,
  ): Promise<FileView> {
    if (input.size === 0) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileEmpty' }]);
    }
    if (input.size > CHAT_VIDEO_MAX_BYTES) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileTooLarge' }]);
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(input.path)) hash.update(chunk as Buffer);
    const id = uuidv7();
    const now = new Date();
    const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
    await this.storage.putFile(storageKey, input.path, 'video/mp4');
    const row = await this.prisma.storedFile.create({
      data: {
        id,
        storageKey,
        originalName: cleanName(input.originalname, 'mp4'),
        mimeType: 'video/mp4',
        kind: 'VIDEO',
        purpose: 'CHAT',
        sizeBytes: input.size,
        sha256: hash.digest('hex'),
        scanStatus: 'UNSCANNED',
        ownerUserId,
      },
    });
    await this.audit.record({
      action: 'file.upload',
      correlationId: meta.correlationId,
      actorUserId: ownerUserId,
      actorIp: meta.ip,
      entityType: 'file',
      entityId: id,
      changes: {
        kind: row.kind,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        purpose: 'CHAT',
      },
    });
    return view(row);
  }

  /** A short-lived link to the file, after the access check. Unreadable files look missing. */
  async signedUrl(
    principal: Principal | null,
    id: string,
    variant: Variant,
  ): Promise<{ url: string; expiresAt: string }> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file || !(await this.canRead(principal, file))) throw new AppException('NOT_FOUND');
    if (variant === 'thumb' && !file.thumbnailKey) throw new AppException('NOT_FOUND');
    return this.signer.sign(id, variant);
  }

  /** The bytes behind a signed link. */
  async content(
    id: string,
    query: { v: string; exp: string; sig: string },
  ): Promise<{ body: Buffer; file: StoredFile }> {
    if (!this.signer.verify(id, query.v, query.exp, query.sig)) {
      throw new AppException('NOT_FOUND');
    }
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    const key = query.v === 'thumb' ? file?.thumbnailKey : file?.storageKey;
    const body = file && key ? await this.storage.get(key) : null;
    if (!file || !body) throw new AppException('NOT_FOUND');
    return { body, file };
  }

  /**
   * A stored file as a stream, for a signed link: all of it or a part (a video is fetched in
   * parts by the browser's player).
   */
  async stream(
    id: string,
    query: { v: string; exp: string; sig: string },
    range: (size: number) => ByteRange | undefined,
  ): Promise<{ stream: Readable; size: number; range: ByteRange | undefined; file: StoredFile }> {
    if (!this.signer.verify(id, query.v, query.exp, query.sig) || query.v !== 'full') {
      throw new AppException('NOT_FOUND');
    }
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) throw new AppException('NOT_FOUND');
    const whole = await this.storage.open(file.storageKey);
    if (!whole) throw new AppException('NOT_FOUND');
    const part = range(whole.size);
    if (!part) return { ...whole, range: undefined, file };
    whole.stream.destroy();
    const opened = await this.storage.open(file.storageKey, part);
    if (!opened) throw new AppException('NOT_FOUND');
    return { ...opened, range: part, file };
  }

  async canRead(principal: Principal | null, file: StoredFile): Promise<boolean> {
    if (file.purpose === 'CHAT') {
      // A file of a message is for the people who can read that message, and nobody else:
      // not staff who may upload, and not its sender after they left. Before it is sent, it
      // is its uploader's alone.
      for (const rule of this.rules) {
        const verdict = await rule.canRead(file.id, principal);
        if (verdict !== null) return verdict;
      }
      return (
        principal !== null && file.attachedAt === null && file.ownerUserId === principal.userId
      );
    }
    if (principal && file.ownerUserId === principal.userId) return true;
    if (principal?.permissions.has('files.upload')) return true;
    for (const rule of this.rules) {
      const verdict = await rule.canRead(file.id, principal);
      if (verdict !== null) return verdict;
    }
    return false;
  }

  /** Marks a file as used (unused uploads are removed after a day). */
  async markAttached(id: string): Promise<void> {
    await this.prisma.storedFile.updateMany({
      where: { id, attachedAt: null },
      data: { attachedAt: new Date() },
    });
  }

  /** Deletes the row and the stored bytes. */
  async remove(id: string): Promise<void> {
    const file = await this.prisma.storedFile.delete({ where: { id } }).catch(() => null);
    if (!file) return;
    for (const key of [file.storageKey, file.thumbnailKey]) {
      if (!key) continue;
      await this.storage.delete(key).catch((error: unknown) => {
        this.logger.warn({ err: error, fileId: id }, 'Stored file could not be deleted');
      });
    }
  }
}

export function view(file: StoredFile): FileView {
  return {
    id: file.id,
    kind: file.kind,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    width: file.width,
    height: file.height,
    createdAt: file.createdAt.toISOString(),
  };
}
