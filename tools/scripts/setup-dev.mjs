// `pnpm setup:dev`: prepares a native Windows (or any) development machine. Idempotent.
//   1. checks prerequisites (Node 24, pnpm, PostgreSQL reachable)
//   2. creates .env from .env.example with random local passwords (never printed)
//   3. provisions roles and databases
//   4. generates the Prisma client, migrates the dev and test databases, seeds
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { provision } from './db-provision.mjs';
import {
  ENV_EXAMPLE,
  ENV_FILE,
  databaseUrl,
  loadRootEnv,
  ok,
  pnpm,
  requireEnv,
  step,
  warn,
} from './lib.mjs';

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 24) {
    throw new Error(
      `Node.js 24 LTS is required (found ${process.versions.node}). Install it from https://nodejs.org and open a new terminal.`,
    );
  }
  ok(`Node.js ${process.versions.node}`);
}

function checkPnpm() {
  const agent = process.env.npm_config_user_agent ?? '';
  if (!agent.startsWith('pnpm/')) {
    throw new Error(
      'Run this through pnpm: `pnpm setup:dev` (install pnpm with `npm install -g pnpm@10`).',
    );
  }
  ok(agent.split(' ')[0]);
}

function readEnvFile() {
  return readFileSync(ENV_FILE, 'utf8');
}

// .env editing is line-based string handling (no dynamic regular expressions).
function getEnvValue(content, key) {
  const line = content.split('\n').find((l) => l.startsWith(`${key}=`));
  return line === undefined ? undefined : line.slice(key.length + 1).trim();
}

function setEnvValue(content, key, value) {
  const lines = content.split('\n');
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index === -1) return `${content.replace(/\n*$/, '')}\n${key}=${value}\n`;
  lines[index] = `${key}=${value}`;
  return lines.join('\n');
}

function prepareEnvFile() {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
    ok('.env created from .env.example');
  } else {
    ok('.env exists; filling in only missing generated values');
  }

  let content = readEnvFile();
  for (const key of ['DB_OWNER_PASSWORD', 'DB_APP_PASSWORD']) {
    const current = getEnvValue(content, key);
    if (!current || current === '__GENERATED__') {
      content = setEnvValue(content, key, randomBytes(24).toString('hex'));
      ok(`${key} generated`);
    }
  }
  writeFileSync(ENV_FILE, content);
  loadRootEnv();

  const host = requireEnv('DB_HOST');
  const port = requireEnv('DB_PORT');
  const owner = { user: requireEnv('DB_OWNER_USER'), password: requireEnv('DB_OWNER_PASSWORD') };
  const app = { user: requireEnv('DB_APP_USER'), password: requireEnv('DB_APP_PASSWORD') };
  const dev = requireEnv('DB_NAME');
  const test = requireEnv('DB_TEST_NAME');
  const urls = {
    DATABASE_URL: databaseUrl({ ...app, host, port, database: dev }),
    MIGRATION_DATABASE_URL: databaseUrl({ ...owner, host, port, database: dev }),
    TEST_DATABASE_URL: databaseUrl({ ...app, host, port, database: test }),
    TEST_MIGRATION_DATABASE_URL: databaseUrl({ ...owner, host, port, database: test }),
  };

  content = readEnvFile();
  for (const [key, value] of Object.entries(urls)) content = setEnvValue(content, key, value);
  writeFileSync(ENV_FILE, content);
  loadRootEnv();
  ok('connection strings written to .env');
}

async function checkPostgres() {
  const url = requireEnv('PG_SUPERUSER_URL');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query('SHOW server_version');
    const version = rows[0].server_version;
    if (Number(version.split('.')[0]) < 16) {
      throw new Error(`PostgreSQL 16 or later is required (found ${version}).`);
    }
    ok(`PostgreSQL ${version} reachable`);
  } catch (error) {
    warn('Could not connect to PostgreSQL with PG_SUPERUSER_URL.');
    warn('Is the server running? See README → "Windows setup" → "PostgreSQL".');
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  step('Checking prerequisites');
  checkNode();
  checkPnpm();

  step('Preparing .env');
  prepareEnvFile();

  step('Checking PostgreSQL');
  await checkPostgres();

  await provision();

  step('Generating the Prisma client');
  pnpm(['--filter', '@iua/api', 'db:generate']);

  step('Migrating the development database');
  pnpm(['--filter', '@iua/api', 'db:deploy']);

  step('Migrating the test database');
  pnpm(['--filter', '@iua/api', 'db:deploy'], {
    env: { MIGRATION_DATABASE_URL: requireEnv('TEST_MIGRATION_DATABASE_URL') },
  });

  step('Seeding the development database');
  pnpm(['--filter', '@iua/api', 'db:seed']);

  console.log(
    '\n✔ Development environment ready.\n  Next: `pnpm dev`, then open http://localhost:3001\n',
  );
}

main().catch((error) => {
  console.error(`\n✖ setup:dev failed: ${error.message}`);
  process.exit(1);
});
