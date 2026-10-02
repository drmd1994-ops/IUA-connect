import { NOTIFICATION_KINDS, NOTIFICATION_PREFERENCE_KINDS } from '@iua/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const kind = z.enum(NOTIFICATION_KINDS);
const settableKind = z.enum(NOTIFICATION_PREFERENCE_KINDS);

export class NotificationListQueryDto extends createZodDto(
  z.strictObject({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

const notification = z.strictObject({
  id: z.uuid(),
  kind,
  /** The message key; the client words it in the reader's language. */
  type: z.string(),
  /** The values the message needs (titles, dates). */
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  /** A path inside the site, without the language prefix. */
  link: nullableString(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export class NotificationListDto extends createZodDto(
  z.strictObject({
    items: z.array(notification),
    total: z.number().int(),
    unread: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class UnreadCountDto extends createZodDto(z.strictObject({ unread: z.number().int() })) {}

const preference = z.strictObject({
  kind: settableKind,
  app: z.boolean(),
  email: z.boolean(),
});

export class NotificationPreferencesDto extends createZodDto(
  z.strictObject({
    items: z.array(
      preference.extend({
        /** Always on in both channels; the switches can't be changed. */
        locked: z.boolean(),
      }),
    ),
  }),
) {}

/** The switches to store. Kinds left out keep their current setting. */
export class NotificationPreferencesInputDto extends createZodDto(
  z.strictObject({ items: z.array(preference).max(NOTIFICATION_PREFERENCE_KINDS.length) }),
) {}
