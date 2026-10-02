import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber, nullableString } from '../../common/dto/nullable-string';

const count = z.number().int();

/**
 * The admin dashboard: what is waiting, counted when the page opens. A part is null when the
 * person may not act on it; the page then leaves that tile out.
 */
export class AdminDashboardDto extends createZodDto(
  z.strictObject({
    applications: z.strictObject({ waitingDirector: count, waitingAssociation: count }).nullable(),
    members: z
      .strictObject({
        active: count,
        suspended: count,
        expired: count,
        byType: z.array(
          z.strictObject({
            key: z.string(),
            nameHe: z.string(),
            nameEn: z.string(),
            active: count,
          }),
        ),
      })
      .nullable(),
    review: z
      .strictObject({
        /** Null when the person doesn't review that kind. */
        news: nullableNumber(),
        education: nullableNumber(),
        examQuestions: nullableNumber(),
      })
      .nullable(),
    broadcasts: z.strictObject({ waitingApproval: count }).nullable(),
    events: z
      .strictObject({
        /** Published events starting in the next 30 days, soonest first (at most five). */
        upcoming: z.array(
          z.strictObject({
            id: z.uuid(),
            titleHe: nullableString(),
            titleEn: nullableString(),
            startAt: z.iso.datetime(),
            registered: count,
          }),
        ),
        upcomingTotal: count,
      })
      .nullable(),
    accounts: z.strictObject({ locked: count, disabled: count }).nullable(),
  }),
) {}
