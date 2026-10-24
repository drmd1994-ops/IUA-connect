import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * M26 exit tests (docs/plans/M26-case-discussions.md §7): a resident presents a made-up case,
 * stopped once for an ID number; the Andrology moderator reviews and approves it; another member
 * answers the poll and reports it, which hides it; the moderator restores it; the pages in Hebrew.
 * Axe on every new page. The demo people are fictional, and every case here is made up.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const AUTHOR = 'member.resident@demo.test';
const MODERATOR = 'member.full@demo.test';
const READER = 'mentor.yonatan@demo.test';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function memberPage(browser: Browser, email: string, locale: 'he' | 'en' = 'en') {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, locale, email, DEMO_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.setTimeout(300_000);

test('a case is presented, reviewed, discussed, reported and restored', async ({ browser }) => {
  const title = `A made-up case of scrotal pain ${Date.now()}`;
  const author = await memberPage(browser, AUTHOR);
  await author.goto('/en/cases/new');
  const form = author.locator('#main');
  await expect(form.getByRole('heading', { name: 'Present a case' })).toBeVisible();
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Subspecialty').selectOption({ label: 'Andrology' });
  await form.getByLabel('Age range').selectOption('FROM_18_TO_39');
  await form.getByLabel('Sex').selectOption('MALE');
  // An ID number stops it before anything is sent.
  await form
    .getByLabel('Presenting problem and history')
    .fill('A made-up case. ID 123456782. Two weeks of dull scrotal pain.');
  await expect(form.getByText('123456782', { exact: false }).last()).toBeVisible();
  await expect(form.getByRole('button', { name: 'Save as a draft' })).toBeDisabled();
  await form
    .getByLabel('Presenting problem and history')
    .fill('A made-up case. Two weeks of dull scrotal pain, no fever.');
  await form.getByLabel('Your question to colleagues').fill('What would you do first?');
  await form.getByLabel('Option 1').fill('Ultrasound first');
  await form.getByLabel('Option 2').fill('Treat and review');
  await expectAccessible(author);
  await form.getByRole('button', { name: 'Save as a draft' }).click();
  await expect(author).toHaveURL(/\/en\/cases\/[0-9a-f-]+$/);
  const address = author.url().replace(/^.*\/en\//, '/en/');
  await author.getByRole('button', { name: 'Send for review' }).click();
  await expect(author.getByText('Waiting for a moderator’s review.')).toBeVisible();
  await expectAccessible(author);

  // Nobody else sees it yet.
  const reader = await memberPage(browser, READER);
  await reader.goto(address);
  await expect(reader.getByText('This case isn’t available.')).toBeVisible();

  const moderator = await memberPage(browser, MODERATOR);
  await moderator.goto('/en/cases/review');
  await expect(moderator.getByRole('heading', { name: 'Cases to review' })).toBeVisible();
  await expectAccessible(moderator);
  await moderator.getByTestId('cases-review').getByRole('link', { name: title }).click();
  await moderator.getByRole('button', { name: 'Approve' }).click();
  await expect(moderator.getByRole('link', { name: 'Discuss it in the community' })).toBeVisible();

  // Another member answers the poll, then reports the case: it is hidden at once.
  await reader.goto(address);
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  await reader.getByRole('button', { name: 'Ultrasound first' }).click();
  await expect(reader.getByTestId('case-poll-totals')).toBeVisible();
  await expectAccessible(reader);
  await reader.getByRole('button', { name: 'Report this case' }).click();
  await reader.getByLabel('What is wrong with it').fill('A made-up report for the test.');
  await reader.getByRole('button', { name: 'Send the report' }).click();
  await expect(reader.getByText('Thank you. The case is hidden')).toBeVisible();
  await reader.goto(address);
  await expect(reader.getByText('This case isn’t available.')).toBeVisible();

  // The moderator sees the report and restores the case.
  await moderator.goto(address);
  await expect(moderator.getByTestId('case-reports')).toContainText('A made-up report');
  await moderator.getByRole('button', { name: 'Restore' }).click();
  await reader.goto(address);
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();

  // The author deletes it, so runs don't pile up cases.
  await author.goto(address);
  await author.getByRole('button', { name: 'Delete the case' }).click();
  await author
    .getByRole('group', { name: 'Delete the case' })
    .getByRole('button', { name: 'Delete the case' })
    .click();
  await expect(author).toHaveURL(/\/en\/cases\/mine$/);
});

test('cases in Hebrew, and my cases', async ({ browser }) => {
  const member = await memberPage(browser, AUTHOR, 'he');
  await member.goto('/he/cases');
  const main = member.locator('#main');
  await expect(main.getByRole('heading', { name: 'מקרים', level: 1 })).toBeVisible();
  await expect(main.getByText('למטרות לימוד. לא ייעוץ לגבי מטופל.')).toBeVisible();
  await expectAccessible(member);
  await member.goto('/he/cases/mine');
  await expect(main.getByRole('heading', { name: 'המקרים שלי' })).toBeVisible();
  // The demo's own case, waiting for review.
  await expect(main.getByTestId('my-cases')).toContainText('ממתין לבדיקה');
  await expectAccessible(member);
});
