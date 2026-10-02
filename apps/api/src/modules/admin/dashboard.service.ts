import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { todayInIsrael } from '../membership';
import { type AdminDashboardDto } from './dashboard.dto';

const DAY = 24 * 60 * 60 * 1000;
export const UPCOMING_DAYS = 30;
const UPCOMING_SHOWN = 5;

/**
 * The numbers on the admin dashboard (M8 plan §2.1). Read-only counts over what the other
 * screens manage; each part is counted only for a person who may act on it, and each number
 * is the size of the list its tile links to.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(principal: Principal, now = new Date()): Promise<AdminDashboardDto> {
    const can = (permission: Parameters<Principal['permissions']['has']>[0]) =>
      principal.permissions.has(permission);
    const [applications, members, review, broadcasts, events, accounts] = await Promise.all([
      can('membership.approve.final') ? this.applications() : null,
      can('membership.read') ? this.members() : null,
      can('news.review') || can('education.review')
        ? this.review(can('news.review'), can('education.review'))
        : null,
      can('broadcasts.approve') ? this.broadcasts() : null,
      can('events.manage') ? this.events(now) : null,
      can('users.read') ? this.accounts(now) : null,
    ]);
    return { applications, members, review, broadcasts, events, accounts };
  }

  private async applications() {
    const [waitingDirector, waitingAssociation] = await Promise.all([
      this.prisma.verificationRequest.count({ where: { state: 'PENDING_DIRECTOR' } }),
      this.prisma.verificationRequest.count({ where: { state: 'PENDING_ADMIN' } }),
    ]);
    return { waitingDirector, waitingAssociation };
  }

  private async members() {
    const today = todayInIsrael();
    const current = { status: 'ACTIVE', endDate: { gte: today } } as const;
    const [active, suspended, expired, types, byType] = await Promise.all([
      this.prisma.membership.count({ where: current }),
      this.prisma.membership.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', endDate: { lt: today } } }),
      this.prisma.membershipType.findMany({
        select: { id: true, key: true, nameHe: true, nameEn: true },
        orderBy: { sortOrder: 'asc' },
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

  private async review(news: boolean, education: boolean) {
    const [newsCount, educationCount, questionCount] = await Promise.all([
      news ? this.prisma.news.count({ where: { status: 'IN_REVIEW' } }) : null,
      education ? this.prisma.educationItem.count({ where: { status: 'IN_REVIEW' } }) : null,
      education ? this.prisma.examQuestion.count({ where: { status: 'IN_REVIEW' } }) : null,
    ]);
    return { news: newsCount, education: educationCount, examQuestions: questionCount };
  }

  private async broadcasts() {
    return {
      waitingApproval: await this.prisma.broadcast.count({
        where: { status: 'PENDING_APPROVAL' },
      }),
    };
  }

  private async events(now: Date) {
    const where = {
      status: 'PUBLISHED',
      startAt: { gte: now, lt: new Date(now.getTime() + UPCOMING_DAYS * DAY) },
    } as const;
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
