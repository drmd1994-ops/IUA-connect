import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M31 exit tests (docs/plans/M31-journal-club.md §7): an editor writes an entry, filled by hand,
 * and submits it; another publishes it; a member reads it, answers the anonymous poll and reaches
 * its discussion; the list in Hebrew. Axe on every new page. The demo's entries and articles are
 * made up (the seed's journal-club layer).
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const MEMBER = 'member.resident@demo.test';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function staffPage(browser: Browser, email: string, role: string) {
  const page = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(page);
  await signIn(page, 'en', email, createAdmin(email, role));
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
  return page;
}

async function memberPage(browser: Browser, locale: 'he' | 'en' = 'en') {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, locale, MEMBER, DEMO_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.setTimeout(300_000);

test('an editor writes an entry, another publishes it, and it is closed', async ({ browser }) => {
  const title = `A made-up study of teaching rounds ${Date.now()}`;
  const writer = await staffPage(browser, uniqueEmail('jc-writer'), 'CONTENT_EDITOR');
  await writer.goto('/en/admin/journal-club/new');
  const main = writer.locator('#main');
  await expect(main.getByRole('heading', { name: 'New journal club entry' })).toBeVisible();
  await main.getByLabel('Subspecialty').selectOption({ label: 'Uro-oncology' });
  // An early month, so the test's entry never becomes "this month".
  await main.getByLabel('Month').fill('2026-01');
  await main.getByLabel('Language of the summary and commentary').selectOption('en');
  await main.getByLabel('Article title').fill(title);
  await main.getByLabel('Journal').fill('Sample Journal (fictional)');
  await main.getByLabel('Summary', { exact: true }).fill('A short made-up summary for the test.');
  await main.getByLabel('Summary written by (their email address)').fill(MEMBER);
  await main.getByLabel('Key points (one per line, up to 5)').fill('First point\nSecond point');
  await expectAccessible(writer);
  await main.getByRole('button', { name: 'Save' }).click();
  await expect(writer).toHaveURL(/\/en\/admin\/journal-club\/[0-9a-f-]+$/);
  await expect(main.getByTestId('journal-club-status')).toHaveText('Status: Draft');
  await main.getByRole('button', { name: 'Submit for review' }).click();
  await expect(main.getByText('You submitted it: another editor publishes it.')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expectAccessible(writer);
  const address = writer.url().replace(/^.*\/en\//, '/en/');

  const publisher = await staffPage(browser, uniqueEmail('jc-publisher'), 'PLATFORM_ADMIN');
  await publisher.goto('/en/admin/journal-club');
  await expect(publisher.getByRole('link', { name: title })).toBeVisible();
  await expectAccessible(publisher);
  await publisher.goto(address);
  await publisher.locator('#main').getByRole('button', { name: 'Publish' }).click();
  await expect(publisher.locator('#main').getByTestId('journal-club-status')).toHaveText(
    'Status: Published',
  );
  // The member's page is for verified people; this staff account isn't one, so only the link's
  // address is checked here. The next test reads an entry as a member.
  const id = address.split('/').pop();
  await expect(publisher.getByRole('link', { name: 'Open it as members see it' })).toHaveAttribute(
    'href',
    `/en/journal-club/${id}`,
  );

  // Closed, so runs don't pile up published entries.
  await publisher.goto(address);
  await publisher.locator('#main').getByRole('button', { name: 'Close' }).click();
  await expect(publisher.locator('#main').getByTestId('journal-club-status')).toHaveText(
    'Status: Closed',
  );
});

test('a member reads this month’s entry, answers the poll and reaches the discussion', async ({
  browser,
}) => {
  const member = await memberPage(browser);
  await member.goto('/en/journal-club');
  const main = member.locator('#main');
  await expect(main.getByRole('heading', { name: 'This month' })).toBeVisible();
  await expectAccessible(member);
  await main.getByRole('region', { name: 'This month' }).getByRole('link').first().click();
  await expect(
    main.getByRole('heading', { name: 'Would this change your practice?' }),
  ).toBeVisible();
  await expect(
    main.getByText('The article itself is not copied here: read it at the publisher.'),
  ).toBeVisible();
  await main.getByRole('button', { name: 'Perhaps' }).click();
  await expect(main.getByRole('button', { name: 'Perhaps' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(main.getByTestId('journal-club-totals')).toBeVisible();
  await expectAccessible(member);
  await main.getByRole('link', { name: 'Discuss it in the community' }).click();
  await expect(member).toHaveURL(/\/en\/communities\/[^/]+\/[0-9a-f-]+$/);
});

test('the journal club in Hebrew', async ({ browser }) => {
  const member = await memberPage(browser, 'he');
  await member.goto('/he/journal-club');
  const main = member.locator('#main');
  await expect(main.getByRole('heading', { name: 'מועדון עיתונות', level: 1 })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'החודש' })).toBeVisible();
  await expectAccessible(member);
  await main.getByRole('region', { name: 'החודש' }).getByRole('link').first().click();
  await expect(main.getByRole('heading', { name: 'האם זה ישנה את הפרקטיקה שלך?' })).toBeVisible();
  await expectAccessible(member);
});
