import { Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { todayInIsrael } from '../membership';
import {
  type ConsentInputDto,
  type ConsentsDto,
  DIRECTORY_CONSENT_VERSION,
  DIRECTORY_PAGE_SIZE,
  type DirectoryListDto,
  type DirectoryMemberDto,
  type DirectoryQueryDto,
} from './directory.dto';
import { type ProfileFieldKey } from './profiles.dto';

const INCLUDE = {
  hospital: { select: { id: true, nameHe: true, nameEn: true } },
  department: { select: { id: true, nameHe: true, nameEn: true } },
  subspecialties: {
    include: {
      subspecialty: {
        select: { id: true, key: true, nameHe: true, nameEn: true, sortOrder: true },
      },
    },
  },
  visibility: true,
} satisfies Prisma.ProfileInclude;
type Row = Prisma.ProfileGetPayload<{ include: typeof INCLUDE }>;

/** What members see of each other: the fields set to "members" or "everyone". */
const SHOWN = ['MEMBERS', 'PUBLIC'] as const;

/**
 * The member directory (M7 plan §2.8, D9). Only signed-in active members read it, and it lists
 * only active members who chose to be listed. Each field appears only when its owner made it
 * visible to members; the first and last name are always shown, which the member is told when
 * they opt in. Someone who is not listed looks exactly like someone who doesn't exist.
 */
@Injectable()
export class DirectoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  /** A listed member's photo is readable by active members, when the member shows it. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const profile = await this.prisma.profile.findFirst({
          where: { photoFileId: fileId },
          select: { userId: true },
        });
        if (!profile) return null;
        if (!principal || !(await this.isActiveMember(principal))) return false;
        const listed = await this.prisma.profile.count({
          where: {
            ...this.listed(),
            userId: profile.userId,
            visibility: { some: { field: 'PHOTO', visibility: { in: [...SHOWN] } } },
          },
        });
        return listed > 0;
      },
    });
  }

  async list(principal: Principal, query: DirectoryQueryDto): Promise<DirectoryListDto> {
    await this.ensureActiveMember(principal);
    const where: Prisma.ProfileWhereInput = {
      ...this.listed(),
      ...(query.q ? { userId: { in: await this.matching(query.q) } } : {}),
      AND: [
        // A filter only matches what the member shows: a hidden hospital can't be found by it.
        ...(query.hospitalId
          ? [{ hospitalId: query.hospitalId, visibility: shows('INSTITUTION') }]
          : []),
        ...(query.subspecialtyId
          ? [
              {
                subspecialties: { some: { subspecialtyId: query.subspecialtyId } },
                visibility: shows('SUBSPECIALTIES'),
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { userId: 'asc' }],
        skip: (query.page - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
      this.prisma.profile.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row)),
      total,
      page: query.page,
      pageSize: DIRECTORY_PAGE_SIZE,
    };
  }

  /** One listed member. Not listed, not active and never existed all answer "not found". */
  async get(principal: Principal, id: string): Promise<DirectoryMemberDto> {
    await this.ensureActiveMember(principal);
    const row = await this.prisma.profile.findFirst({
      where: { ...this.listed(), userId: id },
      include: INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const shown = shownFields(row);
    return {
      ...summary(row),
      bio: shown.has('BIO') ? row.bio : null,
      researchInterests: shown.has('RESEARCH_INTERESTS') ? row.researchInterests : null,
      orcid: shown.has('ORCID') ? row.orcid : null,
      languages: shown.has('LANGUAGES') ? row.languages : [],
      contactEmail: shown.has('CONTACT_EMAIL') ? row.contactEmail : null,
      contactPhone: shown.has('CONTACT_PHONE') ? row.contactPhone : null,
    };
  }

  // --- Consent --------------------------------------------------------------------------------

  async consents(userId: string): Promise<ConsentsDto> {
    const inForce = await this.prisma.consent.findFirst({
      where: { userId, kind: 'DIRECTORY', withdrawnAt: null },
      select: { grantedAt: true },
    });
    return {
      directory: {
        granted: inForce !== null,
        version: DIRECTORY_CONSENT_VERSION,
        grantedAt: inForce?.grantedAt.toISOString() ?? null,
      },
    };
  }

  /**
   * Gives or withdraws the consent to be listed. The consent row and the listing switch change
   * together; withdrawing takes the member off the list at once.
   */
  async setConsent(
    userId: string,
    input: ConsentInputDto,
    meta: RequestMeta,
  ): Promise<ConsentsDto> {
    const [profile, inForce] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.consent.findFirst({
        where: { userId, kind: 'DIRECTORY', withdrawnAt: null },
        select: { id: true },
      }),
    ]);
    if (input.granted === (inForce !== null)) return this.consents(userId);
    if (input.granted && !(profile?.firstName?.trim() && profile.lastName?.trim())) {
      // The list shows the name, so there has to be one.
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'directoryNameRequired' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      if (input.granted) {
        await tx.consent.create({
          data: { id: uuidv7(), userId, kind: 'DIRECTORY', version: DIRECTORY_CONSENT_VERSION },
        });
      } else {
        await tx.consent.updateMany({
          where: { userId, kind: 'DIRECTORY', withdrawnAt: null },
          data: { withdrawnAt: new Date() },
        });
      }
      await tx.profile.updateMany({
        where: { userId },
        data: { directoryOptIn: input.granted },
      });
    });
    await this.audit.record({
      action: input.granted ? 'consent.grant' : 'consent.withdraw',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: userId,
      changes: { kind: 'DIRECTORY', version: DIRECTORY_CONSENT_VERSION },
    });
    return this.consents(userId);
  }

  // --- Internals ------------------------------------------------------------------------------

  /** Opted in, a usable account, and a membership that is active today. */
  private listed(): Prisma.ProfileWhereInput {
    return {
      directoryOptIn: true,
      user: {
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        membership: { status: 'ACTIVE', endDate: { gte: todayInIsrael() } },
      },
    };
  }

  private async isActiveMember(principal: Principal): Promise<boolean> {
    return (await this.access.viewerOf(principal)).activeTypeId !== null;
  }

  private async ensureActiveMember(principal: Principal): Promise<void> {
    if (!(await this.isActiveMember(principal))) {
      throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
    }
  }

  /**
   * The listed members whose visible name contains the text, compared after the Hebrew
   * normalisation (vowel marks, final letters, letter case). The first and last name always
   * count; the Hebrew and English names only when their owner shows them to members.
   */
  async matching(q: string): Promise<string[]> {
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const rows = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT p.user_id AS "userId"
      FROM profiles p
      WHERE p.directory_opt_in
        AND (
          normalize_he(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
            LIKE normalize_he(${pattern})
          OR normalize_he(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, ''))
            LIKE normalize_he(${pattern})
          OR (
            normalize_he(coalesce(p.name_he, '')) LIKE normalize_he(${pattern})
            AND EXISTS (
              SELECT 1 FROM profile_field_visibility v
              WHERE v.user_id = p.user_id AND v.field = 'NAME_HE'
                AND v.visibility IN ('MEMBERS', 'PUBLIC')
            )
          )
          OR (
            normalize_he(coalesce(p.name_en, '')) LIKE normalize_he(${pattern})
            AND EXISTS (
              SELECT 1 FROM profile_field_visibility v
              WHERE v.user_id = p.user_id AND v.field = 'NAME_EN'
                AND v.visibility IN ('MEMBERS', 'PUBLIC')
            )
          )
        )
      LIMIT 2000`;
    return rows.map((row) => row.userId);
  }
}

const shows = (field: ProfileFieldKey): Prisma.ProfileFieldVisibilityListRelationFilter => ({
  some: { field, visibility: { in: [...SHOWN] } },
});

function shownFields(row: Row): Set<ProfileFieldKey> {
  return new Set(
    row.visibility
      .filter((v) => (SHOWN as readonly string[]).includes(v.visibility))
      .map((v) => v.field),
  );
}

function summary(row: Row) {
  const shown = shownFields(row);
  return {
    id: row.userId,
    // Being listed shows the name; the member is told so when they opt in.
    firstName: row.firstName,
    lastName: row.lastName,
    nameHe: shown.has('NAME_HE') ? row.nameHe : null,
    nameEn: shown.has('NAME_EN') ? row.nameEn : null,
    title: shown.has('TITLE') ? row.title : null,
    position: shown.has('POSITION') ? row.position : null,
    hospital: shown.has('INSTITUTION') ? row.hospital : null,
    department: shown.has('INSTITUTION') ? row.department : null,
    subspecialties: shown.has('SUBSPECIALTIES')
      ? [...row.subspecialties]
          .sort((a, b) => a.subspecialty.sortOrder - b.subspecialty.sortOrder)
          .map(({ subspecialty: s }) => ({
            id: s.id,
            key: s.key,
            nameHe: s.nameHe,
            nameEn: s.nameEn,
          }))
      : [],
    photoFileId: shown.has('PHOTO') ? row.photoFileId : null,
  };
}
