import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Optional text: trimmed; empty means "not set". */
const text = (max: number) => z.string().trim().max(max);

const contact = z.strictObject({
  email: z.union([z.literal(''), z.email().max(254)]),
  /** Digits, spaces, dashes and brackets, with an optional leading +. */
  phone: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/),
  ]),
  addressHe: text(300),
  addressEn: text(300),
});

const notice = z
  .strictObject({
    enabled: z.boolean(),
    textHe: text(300),
    textEn: text(300),
  })
  .refine((value) => !value.enabled || value.textHe.length > 0, {
    message: 'A notice that is switched on needs its Hebrew text',
    path: ['textHe'],
  });

const settings = z.strictObject({ contact, notice });

export type SiteSettings = z.infer<typeof settings>;

export const DEFAULT_SETTINGS: SiteSettings = {
  contact: { email: '', phone: '', addressHe: '', addressEn: '' },
  notice: { enabled: false, textHe: '', textEn: '' },
};

/** The settings as an administrator edits them. */
export class SettingsDto extends createZodDto(settings) {}

/** What every page needs: the contact details, and the notice only while it is switched on. */
export class PublicSettingsDto extends createZodDto(
  z.strictObject({
    contact,
    notice: z.strictObject({ textHe: z.string(), textEn: z.string() }).nullable(),
  }),
) {}

export const contactSchema = contact;
export const noticeSchema = notice;
