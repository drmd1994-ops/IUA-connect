import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Sharp } from 'sharp';

/**
 * Upload checks (SECURITY_MODEL.md "Files"; M3 plan §4). The type comes from the content (magic
 * bytes), never from the name or the browser. Images are decoded and re-encoded, which drops all
 * metadata (EXIF, GPS, comments) and anything hidden after the image data.
 */
export type Kind = 'IMAGE' | 'DOCUMENT';
export type Purpose = 'CONTENT' | 'PROFILE_PHOTO' | 'CHAT' | 'VERIFICATION';

const MB = 1024 * 1024;

interface Allowed {
  kind: Kind;
  ext: string;
  maxBytes: number;
}

/** SVG, HTML and anything else are refused. Video and audio wait for the video decision (M6). */
export const ALLOWED_TYPES: Record<string, Allowed> = {
  'image/jpeg': { kind: 'IMAGE', ext: 'jpg', maxBytes: 10 * MB },
  'image/png': { kind: 'IMAGE', ext: 'png', maxBytes: 10 * MB },
  'application/pdf': { kind: 'DOCUMENT', ext: 'pdf', maxBytes: 25 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'DOCUMENT',
    ext: 'docx',
    maxBytes: 25 * MB,
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'DOCUMENT',
    ext: 'pptx',
    maxBytes: 25 * MB,
  },
};

/** The largest upload the server reads at all (the biggest per-type limit). */
export const MAX_UPLOAD_BYTES = 25 * MB;
export const PROFILE_PHOTO_MAX_BYTES = 5 * MB;

/**
 * Files in chat messages (M13 plan §2.7, owner answers §11 and §12): pictures and PDF up to
 * 10 MB, and MP4 video up to 100 MB. Nothing else.
 */
export const CHAT_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const CHAT_FILE_MAX_BYTES = 10 * MB;
export const CHAT_VIDEO_MAX_BYTES = 100 * MB;
/** How much of a file's start is read to tell what it is. */
export const SNIFF_BYTES = 4100;

/** Refuse images that would expand to more pixels than this ("decompression bombs"). */
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_EDGE = 2400;
const THUMB_EDGE = 480;
const PHOTO_EDGE = 1024;
const PHOTO_THUMB = 256;

export type RejectCode = 'fileEmpty' | 'fileTypeNotAllowed' | 'fileTooLarge' | 'fileUnreadable';

export class FileRejected extends Error {
  constructor(readonly code: RejectCode) {
    super(code);
  }
}

export interface PreparedFile {
  kind: Kind;
  mimeType: string;
  body: Buffer;
  thumbnail: Buffer | null;
  width: number | null;
  height: number | null;
  sha256: string;
  originalName: string;
}

export async function prepareUpload(
  input: Buffer,
  uploadedName: string,
  purpose: Purpose,
): Promise<PreparedFile> {
  if (input.length === 0) throw new FileRejected('fileEmpty');
  const detected = await fileTypeFromBuffer(input);
  const allowed = detected ? ALLOWED_TYPES[detected.mime] : undefined;
  if (!detected || !allowed) throw new FileRejected('fileTypeNotAllowed');
  if (purpose === 'PROFILE_PHOTO' && allowed.kind !== 'IMAGE') {
    throw new FileRejected('fileTypeNotAllowed');
  }
  // A school's confirmation (M17) is a picture or a PDF, as in chat.
  if (
    (purpose === 'CHAT' || purpose === 'VERIFICATION') &&
    !CHAT_FILE_TYPES.includes(detected.mime)
  ) {
    throw new FileRejected('fileTypeNotAllowed');
  }
  const limit =
    purpose === 'PROFILE_PHOTO'
      ? PROFILE_PHOTO_MAX_BYTES
      : purpose === 'CHAT' || purpose === 'VERIFICATION'
        ? CHAT_FILE_MAX_BYTES
        : allowed.maxBytes;
  if (input.length > limit) throw new FileRejected('fileTooLarge');

  const originalName = cleanName(uploadedName, allowed.ext);
  if (allowed.kind === 'DOCUMENT') {
    return {
      kind: 'DOCUMENT',
      mimeType: detected.mime,
      body: input,
      thumbnail: null,
      width: null,
      height: null,
      sha256: sha256(input),
      originalName,
    };
  }

  const format = detected.mime === 'image/png' ? 'png' : 'jpeg';
  const encode = (image: Sharp) =>
    format === 'png'
      ? image.png({ compressionLevel: 9 })
      : image.jpeg({ quality: 85, mozjpeg: true });
  const source = () =>
    // rotate() applies the EXIF orientation before the metadata is dropped.
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate();
  try {
    const main =
      purpose === 'PROFILE_PHOTO'
        ? source().resize(PHOTO_EDGE, PHOTO_EDGE, { fit: 'cover' })
        : source().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true });
    const { data: body, info } = await encode(main).toBuffer({ resolveWithObject: true });
    const thumbnail = await encode(
      purpose === 'PROFILE_PHOTO'
        ? source().resize(PHOTO_THUMB, PHOTO_THUMB, { fit: 'cover' })
        : source().resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true }),
    ).toBuffer();
    return {
      kind: 'IMAGE',
      mimeType: detected.mime,
      body,
      thumbnail,
      width: info.width,
      height: info.height,
      sha256: sha256(body),
      originalName,
    };
  } catch {
    throw new FileRejected('fileUnreadable');
  }
}

/** Whether a file's first bytes say it is an MP4 video (the only video chat accepts). */
export async function isMp4(head: Buffer): Promise<boolean> {
  return (await fileTypeFromBuffer(head))?.mime === 'video/mp4';
}

/** A safe display name: no folders or control characters, the extension of the real type. */
export function cleanName(uploaded: string, ext: string): string {
  const base = path
    .basename(uploaded.replace(/\\/g, '/'))
    .replace(/\.[^.]*$/, '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 200);
  return `${base || 'file'}.${ext}`;
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}
