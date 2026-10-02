/**
 * `pnpm demo:reset [--yes] [--keep-files] [--two-step-only]`
 *
 * Puts the demo back to its starting state, so every pitch begins the same way (M9 plan §2.2):
 *   1. empties the development database and rebuilds it from the migrations;
 *   2. loads every seed layer (the fictional people, content, events and so on);
 *   3. empties the outbox and the uploaded files;
 *   4. gives the demo staff accounts one authenticator secret, the same after every reset, so
 *      two-step verification doesn't interrupt a live demo (owner decision, M9 plan §9.1).
 *
 * Development only. It refuses production, the test database and a database on another
 * machine, refuses while something is still connected (stop the servers first), and asks before
 * it deletes anything. `--two-step-only` skips steps 1 to 3.
 *
 * The authenticator secret is generated on this machine and kept in `.env` (never in the
 * repository). It works only for accounts on the reserved demo domain.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@iua/shared';
import { config as loadDotenv } from 'dotenv';
import { Secret, TOTP } from 'otpauth';
import { Client } from 'pg';
import QRCode from 'qrcode';
import { type ResetTarget, checkDemoReset } from '../../src/config/demo-reset-rules';
import { parseEnv } from '../../src/config/env.schema';
import { PrismaClient } from '../../src/generated/prisma/client';
import { FieldCipher } from '../../src/infra/crypto/secrets';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const DEMO_DOMAIN = '@demo.test';
const SECRET_NAME = 'DEMO_TOTP_SECRET';

class CliError extends Error {}

const step = (message: string) => console.log(`\n▶ ${message}`);
const ok = (message: string) => console.log(`  ✔ ${message}`);

/** Runs pnpm in the API package with the target's database addresses. No shell is involved. */
function pnpm(args: string[], target: ResetTarget): void {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new CliError('Run this through pnpm: pnpm demo:reset');
  execFileSync(process.execPath, [pnpmEntry, ...args], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      MIGRATION_DATABASE_URL: target.migrationUrl,
      DATABASE_URL: target.appUrl,
    },
  });
}

async function confirm(database: string): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(
      `\nThis deletes everything in the database "${database}", the outbox and the uploaded files,\n` +
        `and loads the demo data again. Type the database name to continue: `,
    );
    if (answer.trim() !== database) throw new CliError('Nothing was changed.');
  } finally {
    prompt.close();
  }
}

/** Empties the database as its owner, and gives the application role its privileges back. */
async function emptyDatabase(target: ResetTarget): Promise<void> {
  const client = new Client({ connectionString: target.migrationUrl });
  await client.connect();
  try {
    const others = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    );
    if (Number(others.rows[0]!.count) > 0) {
      throw new CliError(
        'Something is still connected to the database. Stop the servers (and close any database tool) and run this again.',
      );
    }
    const app = client.escapeIdentifier(target.appRole);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
    await client.query('CREATE SCHEMA public');
    // The same privileges `pnpm db:provision` sets up (tools/scripts/db-provision.mjs); they
    // went with the schema.
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await client.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app}`,
    );
  } finally {
    await client.end();
  }
}

/** Deletes what is inside a local data folder (never the folder itself, never outside the repo). */
async function emptyFolder(setting: string | undefined, fallback: string): Promise<void> {
  const folder = path.resolve(REPO_ROOT, setting ?? fallback);
  const inside = path.relative(REPO_ROOT, folder);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new CliError(`${folder} is not a folder inside the project; it was left alone.`);
  }
  const entries = await readdir(folder).catch(() => [] as string[]);
  for (const entry of entries) {
    await rm(path.join(folder, entry), { recursive: true, force: true });
  }
  ok(`${inside}: ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} removed`);
}

/** The demo authenticator secret from .env; created and saved there the first time. */
function demoSecret(): { secret: string; created: boolean } {
  const existing = process.env[SECRET_NAME]?.trim();
  if (existing) {
    if (!/^[A-Z2-7]{16,64}$/.test(existing)) {
      throw new CliError(`${SECRET_NAME} in .env is not a valid authenticator secret.`);
    }
    return { secret: existing, created: false };
  }
  if (!existsSync(ENV_FILE)) throw new CliError('.env is missing. Run `pnpm setup:dev` first.');
  const secret = new Secret({ size: 20 }).base32;
  appendFileSync(
    ENV_FILE,
    `\n# Demo only: the authenticator secret of the demo staff accounts (pnpm demo:reset).\n${SECRET_NAME}=${secret}\n`,
  );
  return { secret, created: true };
}

/**
 * Gives every demo staff account (reserved demo domain, a role that needs two-step
 * verification) the demo authenticator as its confirmed second factor.
 */
async function applyDemoTwoStep(target: ResetTarget): Promise<void> {
  const { secret, created } = demoSecret();
  const env = parseEnv({ ...process.env, DATABASE_URL: target.appUrl });
  const cipher = new FieldCipher(env);
  const prisma = new PrismaClient({ adapter: createPgAdapter(target.appUrl) });
  try {
    const staff = await prisma.user.findMany({
      where: {
        email: { endsWith: DEMO_DOMAIN },
        roles: { some: { role: { requiresMfa: true } } },
      },
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    });
    if (staff.length === 0) {
      throw new CliError('There are no demo staff accounts. Run `pnpm db:seed` first.');
    }
    for (const user of staff) {
      await prisma.$transaction([
        prisma.mfaFactor.deleteMany({ where: { userId: user.id, type: 'TOTP' } }),
        prisma.mfaFactor.create({
          data: {
            id: uuidv7(),
            userId: user.id,
            type: 'TOTP',
            secretEncrypted: cipher.encrypt(secret),
            label: 'Demo authenticator',
            confirmedAt: new Date(),
          },
        }),
      ]);
    }
    await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        action: 'admin.cli.demo_two_step',
        correlationId: `cli-${uuidv7()}`,
        changes: { accounts: staff.length },
      },
    });
    ok(`two-step verification set for ${staff.length} demo staff accounts:`);
    for (const user of staff) console.log(`      ${user.email}`);

    // The picture to scan is written next to the outbox mail, which is never committed.
    const uri = new TOTP({
      issuer: 'IUA Connect (demo)',
      label: 'demo staff',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).toString();
    const folder = path.resolve(REPO_ROOT, process.env.MAIL_OUTBOX_DIR ?? 'outbox');
    await mkdir(folder, { recursive: true });
    const picture = path.join(folder, 'demo-authenticator.svg');
    await writeFile(picture, await QRCode.toString(uri, { type: 'svg', margin: 2 }));
    console.log(
      `\n  One authenticator entry signs in all of them.` +
        (created ? ' A new secret was created and saved in .env.' : '') +
        `\n  Add it to your authenticator app once:` +
        `\n    • scan the picture: ${picture}` +
        `\n    • or enter the setup key by hand: ${secret.replace(/(.{4})/g, '$1 ').trim()}` +
        `\n  It stays the same after every reset. Demo accounts only.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  loadDotenv({ path: ENV_FILE, quiet: true });
  const { values } = parseArgs({
    options: {
      yes: { type: 'boolean', default: false },
      'keep-files': { type: 'boolean', default: false },
      'two-step-only': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const check = checkDemoReset(process.env);
  if (!check.ok) throw new CliError(check.problem);
  const { target } = check;

  if (!values['two-step-only']) {
    if (!values.yes) await confirm(target.database);
    step(`Emptying the database "${target.database}"`);
    await emptyDatabase(target);
    ok('emptied');
    if (!values['keep-files']) {
      // Before the seed runs: it writes its sample documents into the storage folder.
      step('Emptying the outbox and the uploaded files');
      await emptyFolder(process.env.MAIL_OUTBOX_DIR, 'outbox');
      await emptyFolder(process.env.STORAGE_DIR, 'storage');
    }
    step('Rebuilding it from the migrations');
    pnpm(['exec', 'prisma', 'migrate', 'deploy'], target);
    step('Loading the demo data');
    pnpm(['exec', 'prisma', 'db', 'seed'], target);
  }
  step('Two-step verification for the demo staff accounts');
  await applyDemoTwoStep(target);
  console.log('✔ The demo is ready. Start it with `pnpm dev`.\n');
}

main().catch((error: unknown) => {
  console.error(`\n✖ ${error instanceof CliError ? error.message : String(error)}\n`);
  process.exit(1);
});
