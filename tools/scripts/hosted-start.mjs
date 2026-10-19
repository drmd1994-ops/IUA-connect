// Starts the server of the hosted demo (M18 plan §2, item 5). Run by the host on every start:
//
//   1. the two database roles and the demo database, as on this computer (db-provision.mjs);
//   2. the database changes, as the owner role;
//   3. the demo data, once: only when the database has nobody in it yet;
//   4. the server, as the application role.
//
// Refuses to run unless DEMO_HOSTED=true. Never prints a password or a key.
import { spawn } from 'node:child_process';
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
  await provision();

  step('Applying database changes');
  pnpm(['--filter', '@medconnect/api', 'db:deploy']);

  if (await isEmpty(requireEnv('DATABASE_URL'))) {
    step('Seeding the demo data (first start)');
    pnpm(['--filter', '@medconnect/api', 'db:seed']);
  } else {
    ok('demo data present; not seeded again');
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
