// Starts the server of the hosted demo (M18 plan §2, item 5). Run by the host on every start:
//
//   1. the two database roles and the demo database, as on this computer (db-provision.mjs);
//   2. the database changes, as the owner role;
//   3. the demo data, once: only when the database has nobody in it yet; later layers that check
//      for themselves (the question bank's starter set, M23) on every start;
//   4. the server, as the application role.
//
// Refuses to run unless DEMO_HOSTED=true. Never prints a password or a key.
import { spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { provision } from './db-provision.mjs';
import { ROOT, ok, pnpm, requireEnv, step } from './lib.mjs';

async function isEmpty(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM users LIMIT 1');
    return rowCount === 0;
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.env.DEMO_HOSTED !== 'true') {
    throw new Error('hosted-start is for the hosted demo only (DEMO_HOSTED=true).');
  }
  if (process.getuid?.() === 0) {
    throw new Error('hosted-start must not run as root; the image starts it as "node".');
  }

  step('Checking the disk for uploads and emails');
  for (const name of ['STORAGE_DIR', 'MAIL_OUTBOX_DIR']) {
    const dir = path.resolve(ROOT, requireEnv(name));
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
      ok(`${name} is writable`);
    } catch {
      throw new Error(`${name} (${dir}) is not writable by the server's user.`);
    }
  }

  await provision();

  step('Applying database changes');
  pnpm(['--filter', '@medconnect/api', 'db:deploy']);

  if (await isEmpty(requireEnv('DATABASE_URL'))) {
    step('Seeding the demo data (first start)');
    pnpm(['--filter', '@medconnect/api', 'db:seed']);
  } else {
    ok('demo data present; not seeded again');
    // The reference layer brings new roles and permissions; the others add what a later
    // milestone brought, once (M23 questions, M28 positions and mentors).
    step('Adding what newer versions brought, if missing');
    pnpm(['--filter', '@medconnect/api', 'db:seed'], {
      env: { SEED_LAYERS: 'reference,question-bank,careers' },
    });
  }

  step('Starting the server');
  const server = spawn(process.execPath, [path.join(ROOT, 'apps/api/dist/main.js')], {
    cwd: path.join(ROOT, 'apps/api'),
    stdio: 'inherit',
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.kill(signal));
  }
  server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
