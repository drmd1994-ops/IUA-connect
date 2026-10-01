import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  addVirtualAuthenticator,
  createAdmin,
  expectSignedIn,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M5 exit test (docs/plans/M5-events.md §7): an event admin creates and publishes an event with
 * two sessions; a member registers, picks a session, downloads the calendar file and is recorded
 * as attending through the venue code; the admin sees the attendance.
 */
// A demo member (seeded by `pnpm db:seed`; fictional, password documented in the README).
const MEMBER = { email: 'member.resident@demo.test', password: 'olive-grove-demo-2026' };

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function newPage(browser: Browser, passkey = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (passkey) await addVirtualAuthenticator(page);
  return page;
}

/** "YYYY-MM-DDTHH:00" on a day `inDays` from now, as typed into an Israel-time field. */
function local(inDays: number, hour: number): string {
  const day = new Date(Date.now() + inDays * 24 * 60 * 60 * 1000);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
  }).format(day);
  return `${date}T${String(hour).padStart(2, '0')}:00`;
}

test.setTimeout(240_000);

test('admin publishes an event → member registers, schedules, downloads, checks in → admin sees it', async ({
  browser,
}) => {
  const admin = await newPage(browser, true);
  const member = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const title = `Sample workshop ${suffix}`;
  const sessionA = `Opening talk ${suffix}`;
  const sessionB = `Hands-on part ${suffix}`;

  // The event admin: first sign-in adds a passkey (the role requires two-step verification).
  const adminEmail = uniqueEmail('m5-events');
  await signIn(admin, 'en', adminEmail, createAdmin(adminEmail, 'EVENT_ADMIN'));
  await expect(admin).toHaveURL(/\/en\/account\/security$/);
  await admin.getByLabel('Passkey name').fill('Laptop');
  await admin.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(admin.getByText('Passkey added.')).toBeVisible();

  // An event admin sees only Events in the admin area.
  await admin.goto('/en/admin');
  await expect(admin).toHaveURL(/\/en\/admin\/events$/);
  await expectAccessible(admin);

  // Create the event (Hebrew is required to publish; the English text is what this test reads).
  await admin.goto('/en/admin/events/new');
  await admin.getByLabel('Title', { exact: true }).fill(`סדנה לדוגמה ${suffix}`);
  await admin.getByRole('tab', { name: 'English' }).click();
  await admin.getByLabel('Title', { exact: true }).fill(title);
  await admin.getByLabel('Summary', { exact: true }).fill('A sample event for the test.');
  await admin.getByLabel('Starts', { exact: true }).fill(local(20, 9));
  await admin.getByLabel('Ends', { exact: true }).fill(local(20, 17));
  await admin.getByLabel('Place', { exact: true }).fill('Example Hall');
  await admin.getByLabel('Registration', { exact: true }).selectOption('INTERNAL');
  await admin.getByLabel('Number of places').fill('5');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(admin).toHaveURL(/\/en\/admin\/events\/[0-9a-f-]{36}$/);
  await expect(admin.getByTestId('event-status')).toHaveText('Draft');

  // Two sessions.
  const programme = admin.getByRole('region', { name: 'Programme' });
  for (const [name, from, to] of [
    [sessionA, 9, 10],
    [sessionB, 11, 12],
  ] as const) {
    await programme.getByRole('button', { name: 'Add a session' }).click();
    await programme.getByLabel('Title in English').fill(name);
    await programme.getByLabel('Starts', { exact: true }).fill(local(20, from));
    await programme.getByLabel('Ends', { exact: true }).fill(local(20, to));
    await programme.getByLabel('Room').fill('Room A');
    await programme.getByRole('button', { name: 'Save session' }).click();
    await expect(admin.getByTestId('admin-sessions')).toContainText(name);
  }
  await expectAccessible(admin);

  await admin.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(admin.getByTestId('event-status')).toHaveText('Published');

  // The member finds the event and registers.
  await signIn(member, 'en', MEMBER.email, MEMBER.password);
  await expectSignedIn(member, MEMBER.email);
  await member.goto('/en/events');
  await expect(member.getByTestId('event-list')).toContainText(title);
  await expectAccessible(member);
  await member.getByRole('link', { name: title }).click();
  const event = member.getByTestId('event');
  await expect(event.getByRole('heading', { name: title })).toBeVisible();
  await expect(event).toContainText('Example Hall');
  const registration = member.getByTestId('event-registration');
  await expect(registration).toContainText('5 places left');
  await registration.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(registration).toContainText('You are registered.');

  // Picks one session for the personal schedule.
  await member.getByLabel(`Add “${sessionB}” to my schedule`).check();
  await member.getByRole('button', { name: 'Save my schedule' }).click();
  await expect(member.getByText('Your schedule was saved.')).toBeVisible();
  await expectAccessible(member);

  // Downloads the event as a calendar file.
  const download = member.waitForEvent('download');
  await member.getByRole('button', { name: 'Add to my calendar' }).click();
  const file = await (await download).path();
  const ics = await readFile(file, 'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain(`SUMMARY:${title}`);

  await member.getByRole('link', { name: 'View my schedule' }).click();
  const schedule = member.getByTestId('my-schedule');
  await expect(schedule).toContainText(title);
  await expect(schedule).toContainText(sessionB);
  await expect(schedule).not.toContainText(sessionA);
  await expectAccessible(member);

  // At the venue: the admin shows the code; the member's phone opens its address.
  await admin.reload();
  await expect(admin.getByTestId('registration-summary')).toContainText('1 registered, 0 waiting');
  await admin.getByRole('button', { name: 'Show the check-in code' }).click();
  const code = admin.getByTestId('check-in-code');
  await expect(code.getByRole('img')).toBeVisible();
  const address = new URL((await code.getAttribute('data-url'))!);
  await expectAccessible(admin);

  await member.goto(address.pathname + address.search);
  await expect(member.getByTestId('check-in-result')).toContainText(
    'Your attendance was recorded.',
  );
  await expectAccessible(member);
  // Opening the same code again records nothing new.
  await member.reload();
  await expect(member.getByTestId('check-in-result')).toContainText('already recorded');

  // The admin sees the attendance.
  await admin.reload();
  await expect(admin.getByTestId('attendance-summary')).toContainText('1 person attended');
  await expect(admin.getByTestId('attendance-list')).toContainText(MEMBER.email);
  await expect(admin.getByTestId('attendance-list')).toContainText('Scanned the code');
});
