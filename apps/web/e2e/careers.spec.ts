import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M28 exit tests (docs/plans/M28-jobs-mentorship.md §6): a position written, reviewed by someone
 * else and found by a visitor; saving; a mentorship request from a resident, accepted by the
 * mentor, opening their conversation. Axe on every new page in both languages. The demo people
 * and positions are fictional (the seed's careers layer).
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const RESIDENT = 'member.resident@demo.test';
const MENTOR = 'mentor.hila@demo.test';
const MENTOR_NAME = 'Hila Shapira';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function staffPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(page);
  await signIn(page, 'en', email, createAdmin(email));
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
  return page;
}

async function memberPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'en', email, DEMO_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.setTimeout(300_000);

test('a position is written, reviewed by someone else, and found by a visitor', async ({
  browser,
  page: visitor,
}) => {
  const writer = await staffPage(browser, uniqueEmail('m28-writer'));
  const reviewer = await staffPage(browser, uniqueEmail('m28-reviewer'));
  const suffix = Date.now().toString().slice(-6);
  const institution = `Made-up Hospital ${suffix}`;
  const title = `Endourology fellowship ${suffix}`;

  await writer.goto('/en/admin/positions/new');
  await expect(writer.getByLabel('Posted by')).toBeVisible();
  await writer.getByLabel('Kind').selectOption('FELLOWSHIP');
  await writer.getByLabel('Title').fill(`השתלמות ${suffix}`);
  await writer.getByRole('tab', { name: 'English' }).click();
  await writer.getByLabel('Title').fill(title);
  await writer.getByLabel('Another institution (in Israel or abroad)').check();
  await writer.getByLabel('Institution', { exact: true }).fill(institution);
  await writer.getByLabel('City', { exact: true }).fill('Lyon');
  await writer.getByLabel('Country').selectOption('FR');
  await writer.getByLabel('Email to apply').fill(`apply-${suffix}@example.test`);
  await writer.getByLabel('Endourology').check();
  await expectAccessible(writer);
  await writer.getByRole('button', { name: 'Send for review' }).click();
  await expect(writer.getByTestId('position-status')).toHaveText('In review');
  const address = writer.url();

  // The writer can't publish their own; another member of staff does.
  await expect(writer.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await reviewer.goto(address);
  await reviewer.getByRole('button', { name: 'Publish' }).click();
  await expect(reviewer.getByTestId('position-status')).toHaveText('Published');
  await reviewer.goto('/en/admin/positions');
  await expect(reviewer.getByTestId('admin-positions')).toContainText(title);
  await expectAccessible(reviewer);

  // A visitor finds it, filtered by kind and country, and reads how to apply.
  await visitor.goto('/en/positions');
  await visitor.getByLabel('Kind').selectOption('FELLOWSHIP');
  await visitor.getByLabel('Country').selectOption('FR');
  await visitor.getByLabel('Search', { exact: true }).fill(institution);
  await visitor.locator('#main').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(visitor.getByTestId('positions-list')).toContainText(title);
  await expectAccessible(visitor);
  await visitor.getByRole('link', { name: title }).click();
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(
    visitor.getByRole('link', { name: `Write to apply-${suffix}@example.test` }),
  ).toBeVisible();
  await expectAccessible(visitor);
});

test('a member saves a sample position, in Hebrew', async ({ browser }) => {
  const member = await memberPage(browser, RESIDENT);
  await member.goto('/he/positions');
  const list = member.getByTestId('positions-list');
  await expect(list).toBeVisible();
  await expectAccessible(member);
  // The demo's positions say that they are samples.
  await list.getByRole('link').first().click();
  await expect(member.getByText('משרה לדוגמה, לא הצעה אמיתית.')).toBeVisible();
  const saveButton = member.getByRole('button', { name: /^(שמירה|הסרה מהשמורים)$/ });
  if ((await saveButton.getAttribute('aria-pressed')) === 'true') await saveButton.click();
  await member.getByRole('button', { name: 'שמירה' }).click();
  await expect(member.getByRole('button', { name: 'הסרה מהשמורים' })).toBeVisible();
  const heading = await member.getByRole('heading', { level: 1 }).innerText();
  await expectAccessible(member);
  await member.goto('/he/positions/saved');
  await expect(member.getByTestId('saved-positions')).toContainText(heading);
  await expectAccessible(member);
});

test('a resident asks a mentor, who accepts; their conversation opens', async ({ browser }) => {
  const resident = await memberPage(browser, RESIDENT);
  // A request left from an earlier run is withdrawn or ended first.
  await resident.goto('/en/mentorship/requests');
  await expect(resident.getByRole('heading', { name: 'Your requests' })).toBeVisible();
  for (const name of ['Withdraw', 'End the mentorship']) {
    const mine = resident
      .getByTestId('requests-yours')
      .getByRole('listitem')
      .filter({ hasText: MENTOR_NAME })
      .getByRole('button', { name });
    while ((await mine.count()) > 0) {
      await mine.first().click();
      await expect(mine).toHaveCount(0);
    }
  }

  await resident.goto('/en/mentorship');
  await resident.getByLabel('Language', { exact: true }).selectOption('ru');
  await resident.getByLabel('Language', { exact: true }).selectOption('');
  const card = resident.getByRole('article').filter({ hasText: MENTOR_NAME });
  await expect(card).toBeVisible();
  await expectAccessible(resident);
  await card.getByRole('button', { name: `Ask ${MENTOR_NAME} for mentorship` }).click();
  await card
    .getByLabel(`Your message to ${MENTOR_NAME}`)
    .fill('I am a resident and would like to talk about pediatric urology.');
  await expectAccessible(resident);
  await card.getByRole('button', { name: 'Send the request' }).click();
  await expect(card.getByText(`Your request was sent.`)).toBeVisible();

  const mentor = await memberPage(browser, MENTOR);
  await mentor.goto('/en/mentorship/requests');
  const request = mentor
    .getByTestId('requests-to-you')
    .getByRole('listitem')
    .filter({ hasText: 'Yoav Sela' })
    .filter({ hasText: 'Waiting for an answer' });
  await expect(request).toBeVisible();
  await expectAccessible(mentor);
  await request.getByRole('button', { name: 'Accept' }).click();
  const accepted = mentor
    .getByTestId('requests-to-you')
    .getByRole('listitem')
    .filter({ hasText: 'Yoav Sela' })
    .filter({ hasText: 'Active' });
  await expect(accepted.getByRole('link', { name: 'Open the conversation' })).toBeVisible();

  await mentor.goto('/en/mentorship/settings');
  await expect(mentor.getByLabel('List me as a mentor')).toBeChecked();
  await expectAccessible(mentor);

  // The resident is told, and opens the conversation.
  await resident.goto('/en/mentorship/requests');
  const mine = resident
    .getByTestId('requests-yours')
    .getByRole('listitem')
    .filter({ hasText: MENTOR_NAME })
    .filter({ hasText: 'Active' });
  await mine.getByRole('link', { name: 'Open the conversation' }).click();
  await expect(resident).toHaveURL(/\/en\/chat\/[0-9a-f-]+$/);
  // Ended, so the next run starts again.
  await resident.goto('/en/mentorship/requests');
  await mine.getByRole('button', { name: 'End the mentorship' }).click();
  await expect(mine).toHaveCount(0);
});
