// Shared helpers for the setup and database scripts. Plain Node (no build step), Windows-first.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = path.join(ROOT, '.env');
export const ENV_EXAMPLE = path.join(ROOT, '.env.example');

export function loadRootEnv() {
  if (existsSync(ENV_FILE)) loadDotenv({ path: ENV_FILE, override: true, quiet: true });
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || value === '__GENERATED__') {
    throw new Error(`${name} is missing in .env. Run \`pnpm setup:dev\` first.`);
  }
  return value;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/** Role and database names come from .env; only plain lower-case identifiers are accepted. */
export function identifier(name) {
  const value = requireEnv(name);
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${name} must be a lower-case identifier (letters, digits, underscore).`);
  }
  return value;
}

export function databaseUrl({ user, password, host, port, database }) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export const step = (message) => console.log(`\n▶ ${message}`);
export const ok = (message) => console.log(`  ✔ ${message}`);
export const warn = (message) => console.warn(`  ! ${message}`);

/** Runs a command through the shell (needed for pnpm.cmd on Windows) and fails loudly. */
export function run(command, { env, cwd = ROOT } = {}) {
  const result = spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
}
