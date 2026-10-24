import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MB = 1024 * 1024;
/** One scan, all its files together (owner's answer, M36 plan §10). */
export const SCAN_MAX_BYTES = 200 * MB;
/** Files in one scan: a long CT has a few hundred; this leaves room without inviting abuse. */
export const SCAN_MAX_FILES = 2000;
/** Scans in one case or library item. */
export const MAX_SCANS = 3;

export const scanSchema = z.strictObject({
  id: z.uuid(),
  /** The kinds of images, such as "CT" or "CT, MR". */
  modalities: z.string(),
  seriesCount: z.number().int(),
  instanceCount: z.number().int(),
  sizeBytes: z.number().int(),
  createdAt: z.iso.datetime(),
});
export class ScanDto extends createZodDto(scanSchema) {}

export class ScanUploadQueryDto extends createZodDto(
  z.strictObject({
    /** The uploader confirms nothing on the images themselves shows a name, number, date or face. */
    confirmed: z.literal('true'),
  }),
) {}

export class ScanViewerDto extends createZodDto(
  z.strictObject({
    /** For the viewer's `url=`: where it reads where the scan is. Valid until `expiresAt`. */
    configUrl: z.string(),
    studyUid: z.string(),
    expiresAt: z.iso.datetime(),
  }),
) {}

export class WadoUriQueryDto extends createZodDto(
  z.looseObject({
    requestType: z.literal('WADO').optional(),
    studyUID: z.string().max(64).optional(),
    seriesUID: z.string().max(64).optional(),
    objectUID: z.string().max(64),
  }),
) {}
