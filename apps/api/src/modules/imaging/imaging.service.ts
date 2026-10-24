import { readFile, rm } from 'node:fs/promises';
import { type Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { SecretHasher } from '../../infra/crypto/secrets';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MalwareScanner } from '../../infra/storage/malware-scanner';
import { ObjectStorage } from '../../infra/storage/object-storage';
import { AuditService } from '../audit';
import { type CleanInstance, ScanRejected, deidentify } from './deidentify';
import { MAX_SCANS, SCAN_MAX_BYTES, SCAN_MAX_FILES } from './imaging.dto';
import { ScanLinkSigner } from './scan-link';

/** A file the upload wrote to disk; the service removes it when done. */
export interface DiskUpload {
  path: string;
  size: number;
}

export interface ScanView {
  id: string;
  modalities: string;
  seriesCount: number;
  instanceCount: number;
  sizeBytes: number;
  createdAt: string;
}

/** Where a scan is used, for the module that owns that place to decide who may read it. */
export interface ScanPlace {
  caseId: string | null;
  educationItemId: string | null;
}

/**
 * Decides whether a caller may read a scan used by some content (a case, a library item). It
 * returns true or false for scans it knows, and null for the rest.
 */
export interface ScanReadRule {
  canRead(place: ScanPlace, principal: Principal | null): Promise<boolean | null>;
}

const SCAN_INCLUDE = { _count: { select: { series: true } } } satisfies Prisma.ScanInclude;
type ScanRow = Prisma.ScanGetPayload<{ include: typeof SCAN_INCLUDE }>;

/** DICOM JSON's way of writing one value. */
const value = (vr: string, v: unknown) => ({ vr, Value: [v] });

/**
 * Scans (M36 plan): uploaded as DICOM files, cleaned of the patient's details on the server before
 * anything is stored (deidentify.ts), and read by the viewer through a signed link to one scan
 * (scan-link.ts) over the DICOMweb paths it needs. Until a scan is attached to a case or a library
 * item it is its uploader's alone; unattached scans are removed after a day.
 */
@Injectable()
export class ImagingService {
  private readonly logger = new Logger(ImagingService.name);
  private readonly links: ScanLinkSigner;
  private readonly rules: ScanReadRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
    hasher: SecretHasher,
  ) {
    this.links = new ScanLinkSigner(hasher);
  }

  registerReadRule(rule: ScanReadRule): void {
    this.rules.push(rule);
  }

  // --- Upload -----------------------------------------------------------------------------------

  /**
   * One study, sent as its DICOM files. Each file is cleaned, checked and stored one at a time, so
   * only one is in memory; one refused file refuses the whole scan and removes what was stored.
   * The uploaded files on disk are removed either way.
   */
  async upload(principal: Principal, files: DiskUpload[], meta: RequestMeta): Promise<ScanView> {
    const keys: string[] = [];
    try {
      ensureMayUpload(principal);
      if (files.length === 0) {
        throw new AppException('VALIDATION_FAILED', [{ field: 'files', code: 'fileMissing' }]);
      }
      const total = files.reduce((sum, f) => sum + f.size, 0);
      if (files.length > SCAN_MAX_FILES || total > SCAN_MAX_BYTES) {
        throw new AppException('VALIDATION_FAILED', [{ field: 'files', code: 'scanTooLarge' }]);
      }
      const now = new Date();
      const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const uids = new Map<string, string>();
      const studies = new Set<string>();
      const stored: Stored[] = [];
      for (const file of files) {
        const { instance, originalStudyUid } = clean(await readFile(file.path), uids);
        studies.add(originalStudyUid);
        if (studies.size > 1) refuse('scanManyStudies');
        if ((await this.scanner.scan(instance.body)) === 'INFECTED') refuse('fileInfected');
        const id = uuidv7();
        const storageKey = `${folder}/${id}`;
        await this.storage.put(storageKey, instance.body, 'application/dicom');
        keys.push(storageKey);
        stored.push({ ...instance, id, storageKey, sizeBytes: instance.body.length, body: null });
      }
      return await this.record(principal, stored, meta);
    } catch (error) {
      await this.deleteKeys(keys);
      throw error;
    } finally {
      await Promise.all(files.map((f) => rm(f.path, { force: true }).catch(() => undefined)));
    }
  }

  private async record(principal: Principal, stored: Stored[], meta: RequestMeta) {
    const scanId = uuidv7();
    const bySeries = new Map<string, Stored[]>();
    for (const item of stored) {
      bySeries.set(item.seriesUid, [...(bySeries.get(item.seriesUid) ?? []), item]);
    }
    const sizeBytes = stored.reduce((sum, i) => sum + i.sizeBytes, 0);
    const modalities = [...new Set(stored.map((i) => i.modality))].sort().join(', ');
    const series: Prisma.ScanSeriesCreateManyInput[] = [];
    const instances: Prisma.ScanInstanceCreateManyInput[] = [];
    for (const [seriesUid, items] of bySeries) {
      const seriesId = uuidv7();
      series.push({
        id: seriesId,
        scanId,
        seriesUid,
        modality: items[0]!.modality,
        number: items[0]!.seriesNumber,
        instanceCount: items.length,
      });
      for (const item of items) {
        instances.push({
          id: item.id,
          seriesId,
          sopInstanceUid: item.sopInstanceUid,
          sopClassUid: item.sopClassUid,
          number: item.instanceNumber,
          storageKey: item.storageKey,
          sizeBytes: item.sizeBytes,
          metadata: item.metadata as Prisma.InputJsonValue,
        });
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scan.create({
        data: {
          id: scanId,
          ownerUserId: principal.userId,
          studyUid: stored[0]!.studyUid,
          modalities,
          instanceCount: stored.length,
          sizeBytes,
        },
        include: SCAN_INCLUDE,
      });
      await tx.scanSeries.createMany({ data: series });
      await tx.scanInstance.createMany({ data: instances });
      return { ...created, _count: { series: series.length } };
    });
    await this.audit.record({
      action: 'scan.upload',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'scan',
      entityId: scanId,
      changes: { modalities, series: series.length, instances: stored.length, sizeBytes },
    });
    return view(row);
  }

  // --- Reading ----------------------------------------------------------------------------------

  async get(principal: Principal, id: string): Promise<ScanView> {
    return view(await this.readable(principal, id));
  }

  /** The viewer's way in to one scan, after the access check (scan-link.ts). */
  async viewer(
    principal: Principal,
    id: string,
  ): Promise<{ configUrl: string; studyUid: string; expiresAt: string }> {
    const scan = await this.readable(principal, id);
    const { token, expiresAt } = this.links.sign(scan.id);
    return { configUrl: `${linkRoot(token)}/config.json`, studyUid: scan.studyUid, expiresAt };
  }

  /** The uploader removes a scan they have not attached yet. */
  async remove(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const scan = await this.prisma.scan.findFirst({
      where: { id, ownerUserId: principal.userId, attachedAt: null },
      select: { id: true },
    });
    if (!scan) throw new AppException('NOT_FOUND');
    await this.delete(scan.id);
    await this.audit.record({
      action: 'scan.remove',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'scan',
      entityId: id,
    });
  }

  // --- Attaching, for the cases and library modules ----------------------------------------------

  /**
   * Checks scans a person may attach to a place: their own ones not attached yet, or ones already
   * this place's (a library item's, uploaded by another editor), at most MAX_SCANS. Returns them
   * without duplicates.
   */
  async checkAttachable(
    ownerUserId: string,
    scanIds: readonly string[],
    place: Partial<ScanPlace>,
  ): Promise<string[]> {
    const ids = [...new Set(scanIds)];
    if (ids.length > MAX_SCANS) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'scanIds', code: 'scansTooMany' }]);
    }
    if (ids.length === 0) return [];
    const already = place.caseId
      ? [{ caseId: place.caseId }]
      : place.educationItemId
        ? [{ educationItemId: place.educationItemId }]
        : [];
    const found = await this.prisma.scan.count({
      where: { id: { in: ids }, OR: [{ attachedAt: null, ownerUserId }, ...already] },
    });
    if (found !== ids.length) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'scanIds', code: 'unknownScan' }]);
    }
    return ids;
  }

  /**
   * Makes `scanIds` the place's scans, in that order, inside the caller's transaction. Scans the
   * place no longer uses are returned, for the caller to delete after the transaction.
   */
  async attach(
    tx: Prisma.TransactionClient,
    place: { caseId: string } | { educationItemId: string },
    scanIds: string[],
  ): Promise<string[]> {
    const where = 'caseId' in place ? { caseId: place.caseId } : place;
    const dropped = await tx.scan.findMany({
      where: { ...where, id: { notIn: scanIds } },
      select: { id: true },
    });
    const now = new Date();
    for (const [position, id] of scanIds.entries()) {
      await tx.scan.update({
        where: { id },
        data: { ...where, position, attachedAt: now },
      });
    }
    return dropped.map((d) => d.id);
  }

  /** A place's scans, in order. */
  async listFor(place: { caseId: string } | { educationItemId: string }): Promise<ScanView[]> {
    const rows = await this.prisma.scan.findMany({
      where: place,
      orderBy: { position: 'asc' },
      include: SCAN_INCLUDE,
    });
    return rows.map(view);
  }

  /** Deletes scans and their stored files (a place that dropped them, or was deleted). */
  async deleteMany(ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.delete(id);
  }

  async deleteFor(place: { caseId: string } | { educationItemId: string }): Promise<void> {
    const rows = await this.prisma.scan.findMany({ where: place, select: { id: true } });
    await this.deleteMany(rows.map((r) => r.id));
  }

  // --- The viewer's DICOMweb paths, behind a signed link ------------------------------------------

  /** The viewer's data source settings (OHIF's "dicomwebproxy" reads them from `url=`). */
  async config(token: string): Promise<unknown> {
    await this.byToken(token);
    const root = linkRoot(token);
    return {
      servers: {
        dicomWeb: [
          {
            name: 'medconnect',
            qidoRoot: root,
            wadoRoot: root,
            wadoUriRoot: `${root}/wado`,
            imageRendering: 'wadouri',
            thumbnailRendering: 'wadouri',
            qidoSupportsIncludeField: false,
            supportsFuzzyMatching: false,
            supportsWildcard: false,
            enableStudyLazyLoad: false,
            staticWado: true,
            singlepart: 'bulkdata,video,pdf',
          },
        ],
      },
    };
  }

  /** QIDO-RS studies: just this scan's study. */
  async studies(token: string): Promise<unknown[]> {
    const scan = await this.byToken(token);
    return [
      {
        '0020000D': value('UI', scan.studyUid),
        '00080061': { vr: 'CS', Value: scan.modalities.split(', ') },
        '00201206': value('IS', scan._count.series),
        '00201208': value('IS', scan.instanceCount),
        '00100010': { vr: 'PN' },
        '00100020': { vr: 'LO' },
        '00080020': { vr: 'DA' },
      },
    ];
  }

  /** QIDO-RS series of the study. */
  async series(token: string, studyUid: string): Promise<unknown[]> {
    const scan = await this.byToken(token, studyUid);
    const rows = await this.prisma.scanSeries.findMany({
      where: { scanId: scan.id },
      orderBy: [{ number: 'asc' }, { id: 'asc' }],
    });
    return rows.map((s) => ({
      '0020000D': value('UI', scan.studyUid),
      '0020000E': value('UI', s.seriesUid),
      '00080060': value('CS', s.modality),
      ...(s.number === null ? {} : { '00200011': value('IS', s.number) }),
      '00201209': value('IS', s.instanceCount),
    }));
  }

  /** QIDO-RS instances of a series. */
  async instances(token: string, studyUid: string, seriesUid: string): Promise<unknown[]> {
    const scan = await this.byToken(token, studyUid);
    const rows = await this.prisma.scanInstance.findMany({
      where: { series: { scanId: scan.id, seriesUid } },
      orderBy: [{ number: 'asc' }, { id: 'asc' }],
      select: { sopInstanceUid: true, sopClassUid: true, number: true },
    });
    return rows.map((i) => ({
      '0020000D': value('UI', scan.studyUid),
      '0020000E': value('UI', seriesUid),
      '00080016': value('UI', i.sopClassUid),
      '00080018': value('UI', i.sopInstanceUid),
      ...(i.number === null ? {} : { '00200013': value('IS', i.number) }),
    }));
  }

  /** WADO-RS metadata: every instance of the study, or of one series. */
  async metadata(token: string, studyUid: string, seriesUid?: string): Promise<unknown[]> {
    const scan = await this.byToken(token, studyUid);
    const rows = await this.prisma.scanInstance.findMany({
      where: { series: { scanId: scan.id, ...(seriesUid ? { seriesUid } : {}) } },
      orderBy: [{ number: 'asc' }, { id: 'asc' }],
      select: { metadata: true },
    });
    return rows.map((r) => r.metadata);
  }

  /** WADO-URI: one image file, as stored (already cleaned). */
  async file(token: string, sopInstanceUid: string): Promise<{ stream: Readable; size: number }> {
    const scan = await this.byToken(token);
    const row = await this.prisma.scanInstance.findFirst({
      where: { sopInstanceUid, series: { scanId: scan.id } },
      select: { storageKey: true },
    });
    const opened = row ? await this.storage.open(row.storageKey) : null;
    if (!opened) throw new AppException('NOT_FOUND');
    return opened;
  }

  // --- Clean-up ---------------------------------------------------------------------------------

  /** Scans never attached, older than `before`. */
  async removeUnattached(before: Date): Promise<number> {
    const stale = await this.prisma.scan.findMany({
      where: { attachedAt: null, createdAt: { lt: before } },
      select: { id: true },
      take: 50,
    });
    await this.deleteMany(stale.map((s) => s.id));
    return stale.length;
  }

  // --- Helpers ----------------------------------------------------------------------------------

  private async readable(principal: Principal | null, id: string): Promise<ScanRow> {
    const scan = await this.prisma.scan.findUnique({ where: { id }, include: SCAN_INCLUDE });
    if (!scan || !(await this.canRead(principal, scan))) throw new AppException('NOT_FOUND');
    return scan;
  }

  private async canRead(principal: Principal | null, scan: ScanRow): Promise<boolean> {
    if (scan.attachedAt === null) {
      return principal !== null && scan.ownerUserId === principal.userId;
    }
    for (const rule of this.rules) {
      const verdict = await rule.canRead(scan, principal);
      if (verdict !== null) return verdict;
    }
    return false;
  }

  /** The scan a signed link opens; an unknown, expired or changed link, or another study, is 404. */
  private async byToken(token: string, studyUid?: string): Promise<ScanRow> {
    const id = this.links.verify(token);
    const scan = id
      ? await this.prisma.scan.findUnique({ where: { id }, include: SCAN_INCLUDE })
      : null;
    if (!scan || (studyUid !== undefined && scan.studyUid !== studyUid)) {
      throw new AppException('NOT_FOUND');
    }
    return scan;
  }

  private async delete(id: string): Promise<void> {
    const instances = await this.prisma.scanInstance.findMany({
      where: { series: { scanId: id } },
      select: { storageKey: true },
    });
    await this.prisma.scan.delete({ where: { id } }).catch(() => null);
    await this.deleteKeys(instances.map((i) => i.storageKey));
  }

  private async deleteKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.storage.delete(key).catch((error: unknown) => {
        this.logger.warn({ err: error, key }, 'Stored scan file could not be deleted');
      });
    }
  }
}

/** A cleaned file once stored: what its row needs, without the bytes. */
type Stored = Omit<CleanInstance, 'body'> & {
  body: null;
  id: string;
  storageKey: string;
  sizeBytes: number;
};

function clean(body: Buffer, uids: Map<string, string>) {
  try {
    return deidentify(body, uids);
  } catch (error) {
    if (error instanceof ScanRejected) refuse(error.code);
    throw error;
  }
}

function refuse(code: string): never {
  throw new AppException('VALIDATION_FAILED', [{ field: 'files', code }]);
}

function linkRoot(token: string): string {
  return `/api/v1/imaging/v/${token}`;
}

/** Verified physicians upload scans for their cases; library editors for library items. */
function ensureMayUpload(principal: Principal): void {
  if (
    !principal.verified &&
    !principal.permissions.has('chat.moderate') &&
    !principal.permissions.has('education.manage')
  ) {
    throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
  }
}

function view(row: ScanRow): ScanView {
  return {
    id: row.id,
    modalities: row.modalities,
    seriesCount: row._count.series,
    instanceCount: row.instanceCount,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}
