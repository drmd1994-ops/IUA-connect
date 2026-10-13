import { PERMISSIONS, ROLES, ROLE_KEYS, uuidv7 } from '@iua/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';
import {
  CHAT_REPORT_CATEGORIES,
  FIRST_ORGANISATION,
  HOSPITALS,
  MEMBERSHIP_TYPES,
  SUBSPECIALTIES,
  UROLOGY_DEPARTMENT,
} from './reference-data';

/**
 * Reference layer: permissions, roles and the role → permission mapping, from the catalogue in
 * @iua/shared (the code is the source of truth, so mappings removed from the code are removed from
 * the database); then the first organisation and its membership types (M16), subspecialties,
 * hospitals and departments (M2), which are inserted when missing and otherwise left as admins
 * edited them. Idempotent.
 */
export async function seedReference(prisma: PrismaClient): Promise<void> {
  const permissionIds = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { id: uuidv7(), key },
    });
    permissionIds.set(key, row.id);
  }

  for (const key of ROLE_KEYS) {
    const definition = ROLES[key];
    const role = await prisma.role.upsert({
      where: { key },
      update: { requiresMfa: definition.requiresMfa },
      create: { id: uuidv7(), key, nameKey: `roles.${key}`, requiresMfa: definition.requiresMfa },
    });
    const wanted = definition.permissions.map((permission) => permissionIds.get(permission)!);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
  console.log(
    `seed: reference layer — ${PERMISSIONS.length} permissions, ${ROLE_KEYS.length} roles`,
  );
  await seedInstitutions(prisma);
  await seedChat(prisma);
}

/** The reasons a person can choose when reporting in chat (M11): inserted when missing. */
async function seedChat(prisma: PrismaClient): Promise<void> {
  for (const [index, category] of CHAT_REPORT_CATEGORIES.entries()) {
    await prisma.chatReportCategory.upsert({
      where: { key: category.key },
      update: {},
      create: { id: uuidv7(), ...category, sortOrder: index + 1 },
    });
  }
  console.log(`seed: reference layer — ${CHAT_REPORT_CATEGORIES.length} chat report categories`);
}

/**
 * The first organisation with its membership types; subspecialties, hospitals and their urology
 * departments (M2).
 */
async function seedInstitutions(prisma: PrismaClient): Promise<void> {
  const organisation = await prisma.organisation.upsert({
    where: { id: FIRST_ORGANISATION.id },
    update: {},
    create: { ...FIRST_ORGANISATION },
  });
  for (const [index, type] of MEMBERSHIP_TYPES.entries()) {
    await prisma.membershipType.upsert({
      where: { organisationId_key: { organisationId: organisation.id, key: type.key } },
      update: {},
      create: { id: uuidv7(), organisationId: organisation.id, ...type, sortOrder: index + 1 },
    });
  }
  for (const [index, subspecialty] of SUBSPECIALTIES.entries()) {
    await prisma.subspecialty.upsert({
      where: { key: subspecialty.key },
      update: {},
      create: { id: uuidv7(), ...subspecialty, sortOrder: index + 1 },
    });
  }
  for (const hospital of HOSPITALS) {
    const row = await prisma.hospital.upsert({
      where: { code: hospital.code },
      update: {},
      create: { id: uuidv7(), ...hospital },
    });
    await prisma.department.upsert({
      where: { hospitalId_code: { hospitalId: row.id, code: UROLOGY_DEPARTMENT.code } },
      update: {},
      create: { id: uuidv7(), hospitalId: row.id, ...UROLOGY_DEPARTMENT },
    });
  }
  console.log(
    `seed: reference layer — ${MEMBERSHIP_TYPES.length} membership types, ` +
      `${SUBSPECIALTIES.length} subspecialties, ${HOSPITALS.length} hospitals`,
  );
}
