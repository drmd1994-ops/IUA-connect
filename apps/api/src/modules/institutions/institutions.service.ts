import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { ORGANISATION_REF } from '../organisations';
import {
  type AdminHospitalDto,
  type CreateDepartmentDto,
  type CreateHospitalDto,
  type DepartmentDto,
  type DirectorDto,
  type HospitalDto,
  type MembershipTypeDto,
  type SubspecialtyDto,
  type UpdateDepartmentDto,
  type UpdateHospitalDto,
} from './institutions.dto';

const DIRECTOR_ROLE = 'DEPARTMENT_DIRECTOR';

/**
 * Hospitals, departments and their directors, plus the public reference lists (M2 checkpoint 1).
 * Rows are deactivated rather than deleted, so memberships and history keep their references.
 */
@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Public reference lists ---------------------------------------------------------------

  async hospitals(): Promise<HospitalDto[]> {
    return this.prisma.hospital.findMany({
      where: { active: true },
      select: { id: true, nameHe: true, nameEn: true, cityHe: true, cityEn: true },
      orderBy: { nameEn: 'asc' },
    });
  }

  async departments(hospitalId: string): Promise<DepartmentDto[]> {
    const hospital = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, active: true },
      select: { id: true },
    });
    if (!hospital) throw new AppException('NOT_FOUND');
    return this.prisma.department.findMany({
      where: { hospitalId, active: true },
      select: { id: true, nameHe: true, nameEn: true },
      orderBy: { nameEn: 'asc' },
    });
  }

  async subspecialties(): Promise<SubspecialtyDto[]> {
    return this.prisma.subspecialty.findMany({
      where: { active: true },
      select: { id: true, key: true, nameHe: true, nameEn: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** The membership types of the active organisations, each organisation's together. */
  async membershipTypes(organisationId?: string): Promise<MembershipTypeDto[]> {
    return this.prisma.membershipType.findMany({
      where: {
        active: true,
        organisation: { active: true },
        ...(organisationId ? { organisationId } : {}),
      },
      select: {
        id: true,
        organisation: { select: ORGANISATION_REF },
        key: true,
        nameHe: true,
        nameEn: true,
        identifier: true,
        selfApply: true,
        directorApproval: true,
      },
      orderBy: [{ organisation: { nameEn: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  // --- Admin: hospitals and departments -----------------------------------------------------

  async adminHospitals(): Promise<AdminHospitalDto[]> {
    const [hospitals, directors] = await Promise.all([
      this.prisma.hospital.findMany({
        include: { departments: { orderBy: { nameEn: 'asc' } } },
        orderBy: { nameEn: 'asc' },
      }),
      this.directorGrants(),
    ]);
    return hospitals.map((hospital) => ({
      id: hospital.id,
      nameHe: hospital.nameHe,
      nameEn: hospital.nameEn,
      cityHe: hospital.cityHe,
      cityEn: hospital.cityEn,
      active: hospital.active,
      departments: hospital.departments.map((department) => ({
        id: department.id,
        nameHe: department.nameHe,
        nameEn: department.nameEn,
        active: department.active,
        directors: directors.get(department.id) ?? [],
      })),
    }));
  }

  async createHospital(input: CreateHospitalDto): Promise<{ id: string }> {
    const id = uuidv7();
    // Admin-created hospitals get a code the reference seed will never use.
    await this.prisma.hospital.create({ data: { id, code: `admin-${id}`, ...input } });
    return { id };
  }

  async updateHospital(id: string, input: UpdateHospitalDto): Promise<void> {
    await this.ensureHospital(id);
    await this.prisma.hospital.update({ where: { id }, data: input });
  }

  async createDepartment(hospitalId: string, input: CreateDepartmentDto): Promise<{ id: string }> {
    await this.ensureHospital(hospitalId);
    const id = uuidv7();
    await this.prisma.department.create({
      data: { id, hospitalId, code: `admin-${id}`, ...input },
    });
    return { id };
  }

  async updateDepartment(id: string, input: UpdateDepartmentDto): Promise<void> {
    await this.ensureDepartment(id);
    await this.prisma.department.update({ where: { id }, data: input });
  }

  // --- Admin: department directors ----------------------------------------------------------

  async directors(departmentId: string): Promise<DirectorDto[]> {
    await this.ensureDepartment(departmentId);
    return (await this.directorGrants(departmentId)).get(departmentId) ?? [];
  }

  /**
   * Makes an existing, verified, active account a director of the department (idempotent).
   * The role requires MFA, so the director is asked to set it up at their next sign-in.
   */
  async assignDirector(
    departmentId: string,
    email: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<DirectorDto[]> {
    await this.ensureDepartment(departmentId);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppException('NOT_FOUND', [{ field: 'email', code: 'userNotFound' }]);
    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [
        { field: 'email', code: 'accountNotActive' },
      ]);
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: DIRECTOR_ROLE } });
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, scopeType: 'DEPARTMENT', scopeId: departmentId },
    });
    if (!existing) {
      await this.prisma.userRole.create({
        data: {
          id: uuidv7(),
          userId: user.id,
          roleId: role.id,
          scopeType: 'DEPARTMENT',
          scopeId: departmentId,
          grantedBy: actorUserId,
        },
      });
      await this.audit.record({
        action: 'institutions.director.assign',
        correlationId: meta.correlationId,
        actorUserId,
        actorIp: meta.ip,
        entityType: 'department',
        entityId: departmentId,
        changes: { directorUserId: user.id },
      });
    }
    return this.directors(departmentId);
  }

  async removeDirector(
    departmentId: string,
    userId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.ensureDepartment(departmentId);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: DIRECTOR_ROLE } });
    const { count } = await this.prisma.userRole.deleteMany({
      where: { userId, roleId: role.id, scopeType: 'DEPARTMENT', scopeId: departmentId },
    });
    if (count === 0) throw new AppException('NOT_FOUND');
    await this.audit.record({
      action: 'institutions.director.remove',
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'department',
      entityId: departmentId,
      changes: { directorUserId: userId },
    });
  }

  // --- internals ------------------------------------------------------------------------------

  /** Director grants by department ID (all departments, or one). */
  private async directorGrants(departmentId?: string): Promise<Map<string, DirectorDto[]>> {
    const grants = await this.prisma.userRole.findMany({
      where: {
        role: { key: DIRECTOR_ROLE },
        scopeType: 'DEPARTMENT',
        ...(departmentId ? { scopeId: departmentId } : {}),
      },
      select: { scopeId: true, grantedAt: true, user: { select: { id: true, email: true } } },
      orderBy: { grantedAt: 'asc' },
    });
    const byDepartment = new Map<string, DirectorDto[]>();
    for (const grant of grants) {
      const list = byDepartment.get(grant.scopeId!) ?? [];
      list.push({
        userId: grant.user.id,
        email: grant.user.email,
        grantedAt: grant.grantedAt.toISOString(),
      });
      byDepartment.set(grant.scopeId!, list);
    }
    return byDepartment;
  }

  private async ensureHospital(id: string): Promise<void> {
    const found = await this.prisma.hospital.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppException('NOT_FOUND');
  }

  private async ensureDepartment(id: string): Promise<void> {
    const found = await this.prisma.department.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppException('NOT_FOUND');
  }
}
