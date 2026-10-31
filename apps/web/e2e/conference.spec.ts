import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M32 exit test (docs/plans/M32-conference-mode.md §6): the manager starts the demo's conference;
 * a guest comes in through its QR address with no details, votes and asks; the chair opens the
 * poll and lets the question through; another guest sees it, and a guest reaches nothing else.
 */
// Demo people (seeded by `pnpm db:seed`; fictional, password documented in the README).
const CHAIR = { email: 'chair@demo.test', password: 'ilikeIUAconnect11' };

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function newPage(browser: Browser, passkey = false) {
  const page = await (await browser.newContext()).newPage();
  if (passkey) await addVirtualAuthenticator(page);
  return page;
}

async function enterAsGuest(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByText('No name, email or password')).toBeVisible();
  await page.getByRole('button', { name: 'Enter as a guest' }).click();
  await expect(page.getByTestId('now-and-next')).toBeVisible();
  await expect(page.getByText(/^Guest \d+$/)).toBeVisible();
}

test.setTimeout(240_000);

test('guest comes in with no details, votes and asks; the chair runs the session', async ({
  browser,
}) => {
  // The manager: first sign-in adds a passkey (the role requires two-step verification).
  const manager = await newPage(browser, true);
  const managerEmail = uniqueEmail('m32-manager');
  await signIn(manager, 'en', managerEmail, createAdmin(managerEmail));
  await expect(manager).toHaveURL(/\/en\/account\/security$/);
  await manager.getByLabel('Passkey name').fill('Laptop');
  await manager.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(manager.getByText('Passkey added.')).toBeVisible();

  await manager.goto('/en/admin/events');
  await manager.getByRole('link', { name: 'Sample conference' }).first().click();
  const panel = manager.getByTestId('event-conference');
  await expect(panel).toBeVisible();
  manager.on('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'Start the demonstration' }).click();
  await expect(panel.getByText('The entry is open')).toBeVisible();
  const link = await panel.locator('p[dir="ltr"]').innerText();
  expect(link).toContain('/events/demo-conference/join?code=');
  await expectAccessible(manager);

  // A guest with no details: the event page opens with what is on.
  const guest = await newPage(browser);
  await enterAsGuest(guest, new URL(link).pathname + new URL(link).search);
  await expectAccessible(guest);
  await guest
    .getByTestId('now-and-next')
    .getByRole('link', { name: /Opening: what's new/ })
    .click();
  await expect(guest).toHaveURL(/\/sessions\//);
  await expect(guest.getByRole('heading', { name: 'Polls', exact: true })).toBeVisible();
  // The seed's drafts wait for the chair: a guest sees none of them.
  await expect(guest.getByTestId('poll')).toHaveCount(0);
  const sessionPath = new URL(guest.url()).pathname;

  // The chair opens a poll, and it reaches the guest by itself.
  const chair = await newPage(browser);
  await signIn(chair, 'en', CHAIR.email, CHAIR.password);
  await chair.goto(sessionPath);
  await expect(chair.getByRole('heading', { name: "The chair's controls" })).toBeVisible();
  await chair.getByRole('button', { name: 'Open the poll' }).first().click();
  await expect(chair.getByRole('button', { name: 'Close the poll' })).toBeVisible();
  await expectAccessible(chair);

  const poll = guest.getByTestId('poll');
  await expect(poll).toHaveCount(1, { timeout: 20_000 });
  await poll.getByRole('radio').first().check();
  await poll.getByRole('button', { name: 'Vote' }).click();
  await expect(poll.getByText('Your vote was counted.')).toBeVisible();
  await expect(poll.getByTestId('poll-results')).toContainText('100%');
  await expectAccessible(guest);

  // A question waits for the moderator; another guest sees it only afterwards.
  await guest.getByLabel('Your question').fill('Who decides the programme?');
  await guest.getByRole('button', { name: 'Send the question' }).click();
  await expect(guest.getByText('A moderator reads it')).toBeVisible();

  const second = await newPage(browser);
  await enterAsGuest(second, new URL(link).pathname + new URL(link).search);
  await second.goto(sessionPath);
  await expect(second.getByRole('heading', { name: 'Polls', exact: true })).toBeVisible();
  await expect(second.getByText('Who decides the programme?')).toHaveCount(0);

  const row = chair.getByTestId('questions').getByRole('listitem').filter({
    hasText: 'Who decides the programme?',
  });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Let through' }).click();
  await expect(second.getByText('Who decides the programme?')).toBeVisible({ timeout: 20_000 });

  // A guest has no member's links, and nothing else opens for them.
  await expect(guest.getByRole('link', { name: 'Chat', exact: true })).toHaveCount(0);
  await guest.goto('/en/chat');
  await expect(guest.getByText('Who decides the programme?')).toHaveCount(0);

  // Feedback, once; and the way out.
  await second.getByRole('radio', { name: '5', exact: true }).check();
  await second.getByRole('button', { name: 'Send feedback' }).click();
  await expect(second.getByText('Thank you for your feedback.')).toBeVisible();
  await second.getByRole('button', { name: 'Leave' }).click();
  await expect(second.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
});
