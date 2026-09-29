// Creates (or updates) the database roles and databases for IUA Connect. Idempotent.
//
//   owner role (DB_OWNER_USER): owns the databases and schema; runs migrations; may create
//                               databases (Prisma's shadow database during `migrate dev`).
//   app role   (DB_APP_USER):   used by the API at runtime; CRUD on tables through default
//                               privileges, minus what migrations revoke (e.g. audit_logs).
//
// Connects with PG_SUPERUSER_URL. Never prints passwords.
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { identifier, loadRootEnv, ok, requireEnv, step } from './lib.mjs';

async function withClient(connectionString, fn) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function upsertRole(client, name, password, { createdb }) {
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
  const verb = rowCount ? 'ALTER' : 'CREATE';
  const flags = `LOGIN NOSUPERUSER NOCREATEROLE ${createdb ? 'CREATEDB' : 'NOCREATEDB'}`;
  await client.query(
    `${verb} ROLE ${client.escapeIdentifier(name)} WITH ${flags} PASSWORD ${client.escapeLiteral(password)}`,
  );
  ok(`role ${name} ${rowCount ? 'updated' : 'created'}`);
}

async function ensureDatabase(client, name, owner) {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) {
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(name)} OWNER ${client.escapeIdentifier(owner)} ENCODING 'UTF8' TEMPLATE template0`,
    );
    ok(`database ${name} created`);
  } else {
    await client.query(
      `ALTER DATABASE ${client.escapeIdentifier(name)} OWNER TO ${client.escapeIdentifier(owner)}`,
    );
    ok(`database ${name} exists`);
  }
}

async function configureDatabase(superuserUrl, database, owner, app) {
  const url = new URL(superuserUrl);
  url.pathname = `/${database}`;
  await withClient(url.toString(), async (client) => {
    const db = client.escapeIdentifier(database);
    const o = client.escapeIdentifier(owner);
    const a = client.escapeIdentifier(app);
    await client.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO ${a}`);
    await client.query(`ALTER SCHEMA public OWNER TO ${o}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${a}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${a}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${a}`,
    );
    // Store and compare timestamps in UTC for every client (see apps/api/src/infra/prisma/pg-adapter.ts).
    await client.query(`ALTER DATABASE ${db} SET timezone TO 'UTC'`);
    // Read by migrations that grant or revoke per-table privileges (see the baseline migration).
    await client.query(`ALTER DATABASE ${db} SET iua.app_role = ${client.escapeLiteral(app)}`);
    ok(`database ${database}: privileges configured`);
  });
}

export async function provision() {
  loadRootEnv();
  const superuserUrl = requireEnv('PG_SUPERUSER_URL');
  const owner = identifier('DB_OWNER_USER');
  const app = identifier('DB_APP_USER');
  const databases = [identifier('DB_NAME'), identifier('DB_TEST_NAME')];

  step('Provisioning PostgreSQL roles and databases');
  await withClient(superuserUrl, async (client) => {
    await upsertRole(client, owner, requireEnv('DB_OWNER_PASSWORD'), { createdb: true });
    await upsertRole(client, app, requireEnv('DB_APP_PASSWORD'), { createdb: false });
    for (const database of databases) await ensureDatabase(client, database, owner);
  });
  for (const database of databases) await configureDatabase(superuserUrl, database, owner, app);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  provision().catch((error) => {
    console.error(`\n✖ ${error.message}`);
    process.exit(1);
  });
}
