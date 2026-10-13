import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { organisationMeant } from './organisation-rules';
import { type OrganisationDto, type OrganisationRef } from './organisations.dto';

export const ORGANISATION_REF = { id: true, slug: true, nameHe: true, nameEn: true } as const;

/**
 * The organisations that have a section on the platform (M16). The platform stands without
 * any; an organisation's members, membership, card, news, events and rooms live in its section.
 */
@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active organisations, as anyone may see them. */
  async list(): Promise<OrganisationDto[]> {
    return this.prisma.organisation.findMany({
      where: { active: true },
      orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
      select: { ...ORGANISATION_REF, descriptionHe: true, descriptionEn: true },
    });
  }

  /** One active organisation, by its address or its id. Anything else is "not found". */
  async find(slugOrId: string): Promise<OrganisationDto> {
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const organisation = await this.prisma.organisation.findFirst({
      where: { active: true, ...(byId ? { id: slugOrId } : { slug: slugOrId }) },
      select: { ...ORGANISATION_REF, descriptionHe: true, descriptionEn: true },
    });
    if (!organisation) throw new AppException('NOT_FOUND');
    return organisation;
  }

  /**
   * The organisation a request is about: the one it names, or the one it can only mean (see
   * `organisationMeant`). Naming one that is not there reads as "not found"; leaving it unsaid
   * when it could be several is the caller's mistake, and says so.
   *
   * This says which organisation, never whether the caller may act in it.
   */
  async meant(named: string | undefined | null, userId?: string): Promise<string> {
    const id = await this.resolve(named, userId, false);
    return id!;
  }

  /**
   * The same for a question about the person's own membership ("my membership", "my card").
   * Someone who belongs to no organisation and names none is not making a mistake: the answer
   * to their question is "none", which this says with null.
   */
  async meantForMember(named: string | undefined | null, userId: string): Promise<string | null> {
    return this.resolve(named, userId, true);
  }

  private async resolve(
    named: string | undefined | null,
    userId: string | undefined,
    noneIsAnAnswer: boolean,
  ): Promise<string | null> {
    const [active, mine] = await Promise.all([
      this.prisma.organisation.findMany({ where: { active: true }, select: { id: true } }),
      userId
        ? this.prisma.membership.findMany({ where: { userId }, select: { organisationId: true } })
        : [],
    ]);
    const answer = organisationMeant({
      named: named ?? null,
      active: active.map((row) => row.id),
      mine: mine.map((row) => row.organisationId),
    });
    if ('id' in answer) return answer.id;
    if (answer.problem === 'unknown') throw new AppException('NOT_FOUND');
    const activeIds = new Set(active.map((row) => row.id));
    if (noneIsAnAnswer && !mine.some((row) => activeIds.has(row.organisationId))) return null;
    throw new AppException('VALIDATION_FAILED', [{ code: 'organisationRequired' }]);
  }

  async ref(id: string): Promise<OrganisationRef> {
    return this.prisma.organisation.findUniqueOrThrow({ where: { id }, select: ORGANISATION_REF });
  }
}
