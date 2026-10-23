import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M25 exit tests (docs/plans/M25-community.md §6): a resident writes a question, the patient
 * check stops an ID number, a moderator answers, the question's writer marks the answer,
 * reactions and saving; a moderator removes a comment and locks the post; staff open a
 * community and appoint a moderator. Axe on every new page. The demo people are fictional
 * (the seed's careers and communities layers), and the text says nothing medical.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const RESIDENT = 'member.resident@demo.test';
const MODERATOR = 'member.full@demo.test'; // Noa Bar-Lev moderates Andrology in the demo.

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function memberPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'en', email, DEMO_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.setTimeout(300_000);

test('a question, stopped once for an ID number, answered and marked', async ({ browser }) => {
  const suffix = Date.now().toString().slice(-6);
  const title = `Rotation timetables ${suffix}`;
  const resident = await memberPage(browser, RESIDENT);

  await resident.goto('/en/communities');
  await expect(resident.getByTestId('communities-list')).toContainText('Andrology');
  await expectAccessible(resident);
  await resident.getByRole('link', { name: 'Andrology', exact: true }).click();
  await expect(resident.getByRole('heading', { name: 'Andrology', level: 1 })).toBeVisible();
  await expectAccessible(resident);

  await resident.getByRole('button', { name: 'Write a post' }).click();
  await resident.getByLabel('What kind of post').selectOption('QUESTION');
  await resident.getByLabel('Title', { exact: true }).fill(title);
  await resident
    .getByLabel('Text', { exact: true })
    .fill('My ID is 123456782, how do others plan the rotation?');
  // The check finds the ID number before anything is sent.
  await expect(resident.getByText('“123456782”: an ID number')).toBeVisible();
  await expect(resident.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
  await expectAccessible(resident);
  await resident
    .getByLabel('Text', { exact: true })
    .fill('How do other departments plan the andrology rotation for residents?');
  await resident.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(resident.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const address = resident.url();
  await expectAccessible(resident);

  // The moderator answers; the question's writer marks it.
  const moderator = await memberPage(browser, MODERATOR);
  await moderator.goto(address);
  await moderator.getByLabel('Your comment').fill('We run it as two blocks of six weeks.');
  await moderator.getByRole('button', { name: 'Send', exact: true }).click();
  const answer = moderator.getByTestId('comment').filter({ hasText: 'two blocks of six weeks' });
  await expect(answer).toBeVisible();

  await resident.reload();
  const seen = resident.getByTestId('comment').filter({ hasText: 'two blocks of six weeks' });
  await seen.getByRole('button', { name: 'Mark as the answer' }).click();
  await expect(seen.getByText('The answer', { exact: true })).toBeVisible();
  await seen.getByRole('button', { name: 'Thank you' }).click();
  await expect(seen.getByRole('button', { name: 'Thank you: 1, including yours' })).toBeVisible();

  // Saved, it is in the reader's own list.
  await resident.getByRole('button', { name: 'Save the post' }).click();
  await expect(resident.getByRole('button', { name: 'Remove from saved' })).toBeVisible();
  await resident.goto('/en/communities/saved');
  await expect(resident.getByTestId('feed')).toContainText(title);
  await expectAccessible(resident);

  // The moderator removes a comment with a reason, and locks the post.
  await resident.goto(address);
  await resident.getByLabel('Your comment').fill('Off-topic remark.');
  await resident.getByRole('button', { name: 'Send', exact: true }).click();
  await moderator.reload();
  const offTopic = moderator.getByTestId('comment').filter({ hasText: 'Off-topic remark.' });
  await offTopic.getByRole('button', { name: 'Remove' }).click();
  await offTopic.getByLabel('The reason, shown with the note').fill('Not about the question');
  await offTopic.getByRole('button', { name: 'Remove' }).last().click();
  await expect(moderator.getByText('Removed by a moderator: Not about the question')).toBeVisible();
  await moderator.getByRole('button', { name: 'Lock the post' }).click();
  await expect(moderator.getByText('This post is locked: no more comments.')).toBeVisible();
  await expectAccessible(moderator);
});

test('the communities, in Hebrew', async ({ browser }) => {
  const resident = await memberPage(browser, RESIDENT);
  await resident.goto('/he/communities');
  await expect(resident.getByRole('heading', { name: 'קהילות', level: 1 })).toBeVisible();
  await expectAccessible(resident);
  await resident.goto('/he/communities/following');
  await expect(resident.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(resident);
  // Chat has no rooms any more: their address leads here.
  await resident.goto('/he/chat/rooms');
  await expect(resident).toHaveURL(/\/he\/communities$/);
});

test('staff open a community and appoint a moderator', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(page);
  const email = uniqueEmail('m25-staff');
  await signIn(page, 'en', email, createAdmin(email));
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();

  const suffix = Date.now().toString().slice(-6);
  await page.goto('/en/admin/communities');
  await page.getByRole('button', { name: 'Open a community' }).click();
  await page.getByLabel('Address name').fill(`residents-${suffix}`);
  await page.getByLabel('Name in Hebrew').fill(`פינת המתמחים ${suffix}`);
  await page.getByLabel('Name in English').fill(`Residents’ corner ${suffix}`);
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('article').filter({ hasText: `Residents’ corner ${suffix}` });
  await expect(row).toBeVisible();
  await row.getByLabel('The person’s email address').fill(MODERATOR);
  await row.getByRole('button', { name: 'Add a moderator' }).click();
  await expect(row.getByText('Noa Bar-Lev', { exact: true })).toBeVisible();
  await expectAccessible(page);
  await row.getByRole('button', { name: 'Close the community' }).click();
  await expect(row.getByText('Closed')).toBeVisible();
});
