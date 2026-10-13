import { Injectable } from '@nestjs/common';
import { type PermissionKey } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import {
  type StaffScope,
  coversNothing,
  narrowTo,
  organisationWhere,
  ownedWhere,
  scopeOf,
} from '../../common/auth/scope';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { reportsWhere } from '../chat';
import { todayInIsrael } from '../membership';
import { type AdminDashboardDto } from './dashboard.dto';

const DAY = 24 * 60 * 60 * 1000;
export const UPCOMING_DAYS = 30;
const UPCOMING_SHOWN = 5;

/**
 * The numbers on the admin dashboard (M8 plan §2.1). Read-only counts over what the other
 * screens manage; each part is counted only for a person who may act on it, and each number
 * is the size of the list its tile links to.
 *
 * A permission is held on the platform or in an organisation (M16), so each number counts only
 * what the person's place covers: an organisation's office sees its own applicants and
 * members, never another's. `owner` narrows the page to one organisation, or to the platform's
 * own things.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(principal: Principal, owner?: string, now = new Date()): Promise<AdminDashboardDto> {
    /** Where the person may use the permission, within the owner the page is about. */
    const at = (permission: PermissionKey): StaffScope | null => {
      const scope = narrowTo(scopeOf(principal, permission), owner);
      return coversNothing(scope) ? null : scope;
    };
    /** The parts that are about the platform itself: not on an organisation's page. */
    const platform = (permission: PermissionKey): boolean =>
      (owner === undefined || owner === 'platform') && principal.permissions.has(permission);

    /** For what only organisations have (members, applicants): the platform's part is empty. */
    const inOrganisations = (permission: PermissionKey): StaffScope | null => {
      const scope = at(permission);
      return scope && (scope.everywhere || scope.organisationIds.length > 0) ? scope : null;
    };

    const office = inOrganisations('membership.approve.final');
    const registry = inOrganisations('membership.read');
    const newsReview = at('news.review');
    const educationReview = platform('education.review');
    const approver = at('broadcasts.approve');
    const eventStaff = at('events.manage');
    const moderator = at('chat.moderate');
    const [applications, members, review, broadcasts, events, accounts, chat] = await Promise.all([
      office ? this.applications(office) : null,
      registry ? this.members(registry) : null,
      newsReview || educationReview ? this.review(newsReview, educationReview) : null,
      approver ? this.broadcasts(approver) : null,
      eventStaff ? this.events(eventStaff, now) : null,
      platform('users.read') ? this.accounts(now) : null,
      moderator ? this.chat(moderator) : null,
    ]);
    return { applications, members, review, broadcasts, events, accounts, chat };
  }

  private async chat(scope: StaffScope) {
    return {
      openReports: await this.prisma.chatReport.count({
        where: { status: 'OPEN', ...reportsWhere(scope) },
      }),
    };
  }

  private async applications(scope: StaffScope) {
    const mine = organisationWhere(scope);
    const [waitingDirector, waitingAssociation] = await Promise.all([
      this.prisma.verificationRequest.count({ where: { ...mine, state: 'PENDING_DIRECTOR' } }),
      this.prisma.verificationRequest.count({ where: { ...mine, state: 'PENDING_ADMIN' } }),
    ]);
    return { waitingDirector, waitingAssociation };
  }

  private async members(scope: StaffScope) {
    const today = todayInIsrael();
    const mine = organisationWhere(scope);
    const current = { ...mine, status: 'ACTIVE', endDate: { gte: today } } as const;
    const [active, suspended, expired, types, byType] = await Promise.all([
      this.prisma.membership.count({ where: current }),
      this.prisma.membership.count({ where: { ...mine, status: 'SUSPENDED' } }),
      this.prisma.membership.count({
        where: { ...mine, status: 'ACTIVE', endDate: { lt: today } },
      }),
      this.prisma.membershipType.findMany({
        where: mine,
        select: { id: true, key: true, nameHe: true, nameEn: true },
        orderBy: [{ organisation: { nameEn: 'asc' } }, { sortOrder: 'asc' }],
      }),
      this.prisma.membership.groupBy({ by: ['typeId'], where: current, _count: { id: true } }),
    ]);
    return {
      active,
      suspended,
      expired,
      byType: types.map((type) => ({
        key: type.key,
        nameHe: type.nameHe,
        nameEn: type.nameEn,
        active: byType.find((row) => row.typeId === type.id)?._count.id ?? 0,
      })),
    };
  }

  private async review(news: StaffScope | null, education: boolean) {
    const [newsCount, educationCount, questionCount] = await Promise.all([
      news
        ? this.prisma.news.count({ where: { status: 'IN_REVIEW', AND: [ownedWhere(news)] } })
        : null,
      education ? this.prisma.educationItem.count({ where: { status: 'IN_REVIEW' } }) : null,
      education ? this.prisma.examQuestion.count({ where: { status: 'IN_REVIEW' } }) : null,
    ]);
    return { news: newsCount, education: educationCount, examQuestions: questionCount };
  }

  private async broadcasts(scope: StaffScope) {
    return {
      waitingApproval: await this.prisma.broadcast.count({
        where: { status: 'PENDING_APPROVAL', AND: [ownedWhere(scope)] },
      }),
    };
  }

  private async events(scope: StaffScope, now: Date) {
    const where = {
      status: 'PUBLISHED' as const,
      startAt: { gte: now, lt: new Date(now.getTime() + UPCOMING_DAYS * DAY) },
      AND: [ownedWhere(scope)],
    };
    const [rows, upcomingTotal] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: UPCOMING_SHOWN,
        select: {
          id: true,
          startAt: true,
          translations: { select: { locale: true, title: true } },
          _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      upcoming: rows.map((row) => ({
        id: row.id,
        titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
        titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
        startAt: row.startAt!.toISOString(),
        registered: row._count.registrations,
      })),
      upcomingTotal,
    };
  }

  private async accounts(now: Date) {
    const [locked, disabled] = await Promise.all([
      this.prisma.user.count({
        where: {
          status: { not: 'DISABLED' },
          OR: [{ status: 'LOCKED' }, { lockedUntil: { gt: now } }],
        },
      }),
      this.prisma.user.count({ where: { status: 'DISABLED' } }),
    ]);
    return { locked, disabled };
  }
}
