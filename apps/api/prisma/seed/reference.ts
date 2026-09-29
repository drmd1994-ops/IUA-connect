import { PERMISSIONS, ROLES, ROLE_KEYS, uuidv7 } from '@iua/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Reference layer: permissions, roles and the role → permission mapping, from the catalogue in
 * @iua/shared. Idempotent; the code is the source of truth, so mappings removed from the code are
 * removed from the database.
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
}
