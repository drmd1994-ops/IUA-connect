import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class FileDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    kind: z.enum(['IMAGE', 'DOCUMENT']),
    /** Detected from the content. */
    mimeType: z.string(),
    originalName: z.string(),
    sizeBytes: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    createdAt: z.iso.datetime(),
  }),
) {}

export class FileUrlQueryDto extends createZodDto(
  z.strictObject({ v: z.enum(['full', 'thumb']).default('full') }),
) {}

export class SignedUrlDto extends createZodDto(
  z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() }),
) {}

export class FileContentQueryDto extends createZodDto(
  z.strictObject({
    v: z.string().max(10),
    exp: z.string().max(20),
    sig: z.string().max(200),
  }),
) {}

export class ProfilePhotoDto extends createZodDto(z.strictObject({ photo: FileDto.schema })) {}
