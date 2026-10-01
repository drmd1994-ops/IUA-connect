import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  PROFILE_FIELDS,
  type ProfileDto,
  type ProfileFieldKey,
  type UpdateProfileDto,
} from './profiles.dto';

type Visibility = ProfileDto['visibility'][ProfileFieldKey];

const SCALAR_FIELDS = [
  'firstName',
  'lastName',
  'nameHe',
  'nameEn',
  'title',
  'position',
  'bio',
  'researchInterests',
  'orcid',
  'languages',
  'contactEmail',
  'contactPhone',
] as const;

/** Members' own profiles (spec §6). The visibility-filtered view for others arrives with M7. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string): Promise<ProfileDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        subspecialties: { include: { subspecialty: { select: { sortOrder: true } } } },
        visibility: true,
      },
    });
    const visibility = Object.fromEntries(
      PROFILE_FIELDS.map((field) => [field, 'PRIVATE' as Visibility]),
    ) as ProfileDto['visibility'];
    for (const row of profile?.visibility ?? []) visibility[row.field] = row.visibility;
    return {
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      nameHe: profile?.nameHe ?? null,
      nameEn: profile?.nameEn ?? null,
      title: profile?.title ?? null,
      position: profile?.position ?? null,
      hospitalId: profile?.hospitalId ?? null,
      departmentId: profile?.departmentId ?? null,
      subspecialtyIds: (profile?.subspecialties ?? [])
        .sort((a, b) => a.subspecialty.sortOrder - b.subspecialty.sortOrder)
        .map((row) => row.subspecialtyId),
      bio: profile?.bio ?? null,
      researchInterests: profile?.researchInterests ?? null,
      orcid: profile?.orcid ?? null,
      languages: profile?.languages ?? [],
      contactEmail: profile?.contactEmail ?? null,
      contactPhone: profile?.contactPhone ?? null,
      photoFileId: profile?.photoFileId ?? null,
      visibility,
    };
  }

  async update(userId: string, input: UpdateProfileDto, meta: RequestMeta): Promise<ProfileDto> {
    if (input.departmentId) await this.ensureDepartment(input.hospitalId!, input.departmentId);
    else if (input.hospitalId) await this.ensureHospital(input.hospitalId);
    const subspecialtyIds = input.subspecialtyIds && [...new Set(input.subspecialtyIds)];
    if (subspecialtyIds?.length) await this.ensureSubspecialties(subspecialtyIds);

    const data: Record<string, unknown> = {};
    for (const key of SCALAR_FIELDS) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    if (input.languages) data.languages = [...new Set(input.languages)];
    if (input.hospitalId !== undefined) {
      data.hospitalId = input.hospitalId;
      data.departmentId = input.departmentId ?? null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      if (subspecialtyIds) {
        await tx.profileSubspecialty.deleteMany({ where: { userId } });
        await tx.profileSubspecialty.createMany({
          data: subspecialtyIds.map((subspecialtyId) => ({ userId, subspecialtyId })),
        });
      }
      for (const [field, visibility] of Object.entries(input.visibility ?? {})) {
        const key = { userId, field: field as ProfileFieldKey };
        await tx.profileFieldVisibility.upsert({
          where: { userId_field: key },
          create: { ...key, visibility },
          update: { visibility },
        });
      }
    });

    // Which fields changed, never their values (a profile holds contact details).
    await this.audit.record({
      action: 'profile.update',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'profile',
      entityId: userId,
      changes: {
        fields: Object.keys(input)
          .filter((key) => key !== 'visibility')
          .sort(),
        visibility: Object.keys(input.visibility ?? {}).sort(),
      },
    });
    return this.get(userId);
  }

  private async ensureHospital(hospitalId: string): Promise<void> {
    const found = await this.prisma.hospital.findFirst({ where: { id: hospitalId, active: true } });
    if (!found) throw invalid('hospitalId', 'unknownHospital');
  }

  private async ensureDepartment(hospitalId: string, departmentId: string): Promise<void> {
    const found = await this.prisma.department.findFirst({
      where: { id: departmentId, hospitalId, active: true, hospital: { active: true } },
    });
    if (!found) throw invalid('departmentId', 'unknownDepartment');
  }

  private async ensureSubspecialties(ids: string[]): Promise<void> {
    const count = await this.prisma.subspecialty.count({
      where: { id: { in: ids }, active: true },
    });
    if (count !== ids.length) throw invalid('subspecialtyIds', 'unknownSubspecialty');
  }
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
