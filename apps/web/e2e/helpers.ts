import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { type Page, expect } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUTBOX = path.join(REPO_ROOT, process.env.MAIL_OUTBOX_DIR ?? 'outbox');

export const PASSWORD = 'olive trees near the old port 2026';
export const NEW_PASSWORD = 'cedar forest after the winter rain';

/** A fictional address on a reserved domain (demo mode: no real people). */
export const uniqueEmail = (label: string) =>
  `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;

/**
 * The link from the newest outbox email of a template to an address. The console mailer writes
 * `<uuidv7>-<template>.html` files starting with a `<!-- To: ... -->` header; UUIDv7 names sort
 * by time.
 */
export async function linkFromOutbox(to: string, template: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const files = (await readdir(OUTBOX).catch(() => [] as string[]))
      .filter((file) => file.endsWith(`-${template}.html`))
      .sort()
      .reverse();
    for (const file of files) {
      const html = await readFile(path.join(OUTBOX, file), 'utf8');
      if (!html.startsWith(`<!-- To: ${to} `)) continue;
      const match = /href="([^"]+)"/.exec(html);
      if (match) return match[1]!.replace(/&amp;/g, '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${template} email to ${to} in ${OUTBOX}`);
}

/** The demo's fictional organisation (the seed's demo layer names it). */
export const DEMO_ORGANISATION = {
  slug: 'demo-urological-society',
  name: 'The Sample Urological Society (fictional)',
};

/**
 * Creates a fictional staff account with the development CLI (a super admin unless another
 * unscoped role is named); returns its password. The role is held on the platform, or inside the
 * organisation whose address name is given.
 */
export function createAdmin(email: string, role = 'SUPER_ADMIN', organisation?: string): string {
  // Run pnpm's own entry point with Node (no shell), as `pnpm e2e` sets npm_execpath.
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error('Run the end-to-end tests through pnpm (pnpm e2e).');
  const output = execFileSync(
    process.execPath,
    [
      pnpmEntry,
      'admin:create',
      '--email',
      email,
      '--role',
      role,
      '--locale',
      'en',
      ...(organisation ? ['--organisation', organisation] : []),
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  const password = /Password \(shown once, store it safely\): (\S+)/.exec(output)?.[1];
  if (!password) throw new Error(`admin:create printed no password:\n${output}`);
  return password;
}

/** Current TOTP code for a base32 secret. */
export function totp(secret: string, offsetSteps = 0): string {
  return new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate({
    timestamp: Date.now() + offsetSteps * 30_000,
  });
}

/**
 * Adds a virtual platform authenticator (like Windows Hello with fingerprint/PIN) to the page via
 * the Chromium DevTools protocol, so passkey prompts complete automatically. Chromium and Edge.
 */
export async function addVirtualAuthenticator(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Fills the sign-in form (in either language) using the accessible labels. */
export async function signIn(page: Page, locale: 'he' | 'en', email: string, password: string) {
  const labels =
    locale === 'he'
      ? { email: 'דוא״ל', password: 'סיסמה', submit: 'כניסה' }
      : {
          email: 'Email',
          password: 'Password',
          submit: 'Sign in',
        };
  await page.goto(`/${locale}/login`);
  await page.getByLabel(labels.email, { exact: true }).fill(email);
  await page.getByLabel(labels.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: labels.submit, exact: true }).click();
}

export async function expectSignedIn(page: Page, email: string) {
  await expect(page.getByRole('button', { name: /account menu|תפריט החשבון/i })).toContainText(
    email,
  );
}

/** The newest outbox email of a template to an address, as HTML. */
export async function emailFromOutbox(to: string, template: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const files = (await readdir(OUTBOX).catch(() => [] as string[]))
      .filter((file) => file.endsWith(`-${template}.html`))
      .sort()
      .reverse();
    for (const file of files) {
      const html = await readFile(path.join(OUTBOX, file), 'utf8');
      if (html.startsWith(`<!-- To: ${to} `)) return html;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${template} email to ${to} in ${OUTBOX}`);
}

/** Every link of an email, in order. */
export function linksOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!.replace(/&amp;/g, '&'));
}

/**
 * Runs a scheduled job now with the development CLI (for example the daily summary email,
 * which otherwise goes out in the morning).
 */
export function runJob(name: string): void {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error('Run the end-to-end tests through pnpm (pnpm e2e).');
  const output = execFileSync(process.execPath, [pnpmEntry, 'job:run', name], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (!output.includes(`Ran ${name}.`)) throw new Error(`job:run ${name} failed:\n${output}`);
}
