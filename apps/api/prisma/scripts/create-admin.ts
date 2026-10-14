/**
 * `pnpm admin:create --email <address> [--role SUPER_ADMIN] [--organisation <slug>] [--locale he|en]
 * [--reset-password]`
 *
 * Development only (docs/plans/M1-identity.md §3 "First administrator"). Creates a verified,
 * fictional account and grants it an unscoped administrative role: on the platform itself, or with
 * --organisation inside that organisation. A strong password is generated and printed once. The account must enrol in MFA at first sign-in (every admin role requires it).
 * Running it again for an existing address only grants the role (and a new password with
 * --reset-password). Refuses to run in production and accepts only reserved example domains.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LOCALES } from '@medconnect/i18n';
import { ROLES, ROLE_KEYS, type RoleKey, roleFits, uuidv7 } from '@medconnect/shared';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';

/** RFC 2606 / RFC 6761 names that can never belong to a real person. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|example|invalid|localhost)$/i;

export class CliError extends Error {}

export function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      role: { type: 'string', default: 'SUPER_ADMIN' },
      organisation: { type: 'string' },
      locale: { type: 'string', default: 'he' },
      'reset-password': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new CliError('Give an email address: pnpm admin:create --email admin@example.test');
  }
  const domain = email.split('@')[1]!;
  if (!RESERVED_DOMAIN.test(domain)) {
    throw new CliError(
      'Demo mode allows fictional people only: use a reserved domain such as example.test.',
    );
  }
  const role = values.role as RoleKey;
  if (!ROLE_KEYS.includes(role)) {
    throw new CliError(`Unknown role. Choose one of: ${ROLE_KEYS.join(', ')}`);
  }
  if (ROLES[role].scope !== 'NONE') {
    throw new CliError(`${role} is scoped (e.g. to a department); scoped roles arrive in M2.`);
  }
  const organisation = values.organisation?.trim() || null;
  if (!roleFits(role, organisation !== null)) {
    throw new CliError(
      organisation
        ? `${role} is held on the platform, not inside an organisation.`
        : `${role} is held inside an organisation: add --organisation <slug>.`,
    );
  }
  const locale = values.locale as (typeof LOCALES)[number];
  if (!LOCALES.includes(locale)) throw new CliError(`Locale must be one of: ${LOCALES.join(', ')}`);
  return { email, role, organisation, locale, resetPassword: values['reset-password'] };
}

/** 24 random characters (about 143 bits): comfortably passes the password policy. */
export function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') {
    throw new CliError('admin:create is for development only and refuses NODE_ENV=production.');
  }
  const args = parseCliArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new CliError('DATABASE_URL is not set. Run `pnpm setup:dev`.');

  const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
  const hasher = new PasswordHasher();
  try {
    const role = await prisma.role.findUnique({ where: { key: args.role } });
    if (!role) throw new CliError('Roles are not seeded yet. Run `pnpm db:seed`.');
    const organisation = args.organisation
      ? await prisma.organisation.findUnique({ where: { slug: args.organisation } })
      : null;
    if (args.organisation && !organisation) {
      throw new CliError(`No organisation has the address name "${args.organisation}".`);
    }
    const organisationId = organisation?.id ?? null;

    let user = await prisma.user.findUnique({ where: { email: args.email } });
    let password: string | null = null;
    if (!user) {
      password = generatePassword();
      user = await prisma.user.create({
        data: {
          id: uuidv7(),
          email: args.email,
          passwordHash: await hasher.hash(password),
          emailVerifiedAt: new Date(),
          locale: args.locale,
        },
      });
    } else if (args.resetPassword) {
      password = generatePassword();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hasher.hash(password),
          failedLoginCount: 0,
          lockoutCount: 0,
          lockedUntil: null,
        },
      });
    }

    const granted = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, scopeType: 'NONE', organisationId },
    });
    if (!granted) {
      await prisma.userRole.create({
        data: { id: uuidv7(), userId: user.id, roleId: role.id, scopeType: 'NONE', organisationId },
      });
    }
    await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        action: 'admin.cli.create_admin',
        entityType: 'user',
        entityId: user.id,
        correlationId: `cli-${uuidv7()}`,
        changes: {
          role: args.role,
          organisationId,
          created: password !== null && !args.resetPassword,
        },
      },
    });

    const signIn = `${process.env.APP_BASE_URL ?? 'http://localhost:3001'}/${args.locale}/login`;
    const where = organisation ? `in ${organisation.slug}` : 'on the platform';
    console.log(`\n✔ ${args.email} holds ${args.role} ${where}.`);
    if (password) {
      console.log(`  Password (shown once, store it safely): ${password}`);
    } else {
      console.log('  Existing account: password unchanged (use --reset-password to replace it).');
    }
    console.log(`  Sign in at ${signIn}; you will be asked to set up two-step verification.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\n✖ ${error instanceof CliError ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
