import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * M27 exit tests (docs/plans/M27-research-publications.md): a physician lists a project, a
 * resident finds it and asks to join, the lead accepts and both reach its group; the list and a
 * project in Hebrew; a publication is typed into a profile. (That a medical student cannot list a
 * project is the server's rule, tested in research.int-spec.ts.) Axe on every new page, in both
 * languages. The demo people and projects are fictional (the seed's research layer).
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const LEAD = 'mentor.yonatan@demo.test';
const RESIDENT = 'member.resident@demo.test';
const RESIDENT_NAME = 'Yoav Sela';
const MEMBER = 'member.full@demo.test';

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

test('a physician lists a project; a resident asks to join and is accepted', async ({
  browser,
}) => {
  const title = `A sample study of clinic letters ${Date.now()}`;
  const lead = await memberPage(browser, LEAD);
  await lead.goto('/en/research/new');
  await expect(lead.getByRole('heading', { name: 'List a project' })).toBeVisible();
  await lead.getByLabel('Title').fill(title);
  await lead
    .getByLabel('Description')
    .fill('A fictional study for the browser tests. Looking for residents.');
  await lead.getByLabel('Study type').selectOption('SURVEY');
  await lead.getByLabel('Ethics approval').selectOption('NOT_NEEDED');
  await lead.getByRole('checkbox', { name: 'Residents' }).check();
  await expectAccessible(lead);
  await lead.getByRole('button', { name: 'Save' }).click();
  await expect(lead).toHaveURL(/\/en\/research\/[0-9a-f-]+$/);
  await expect(lead.getByRole('heading', { name: title })).toBeVisible();
  await expect(lead.getByText('Ethics approval: not needed (declared by the lead)')).toBeVisible();
  await expectAccessible(lead);

  const resident = await memberPage(browser, RESIDENT);
  await resident.goto('/en/research');
  // The page's own search, once it is drawn: the header has a search box and button too.
  const main = resident.locator('#main');
  await expect(main.getByRole('heading', { name: 'Research projects' })).toBeVisible();
  await main.getByRole('searchbox', { name: 'Search', exact: true }).fill(title);
  await main.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(main.getByTestId('projects-list').getByRole('listitem')).toHaveCount(1);
  await expectAccessible(resident);
  await main.getByRole('link', { name: title }).click();
  await resident.getByRole('button', { name: 'Ask to join' }).click();
  await resident
    .getByLabel('Your message to the lead')
    .fill('I am a resident and would like to help.');
  await expectAccessible(resident);
  await resident.getByRole('button', { name: 'Send the request' }).click();
  await expect(resident.getByText('Your request was sent.')).toBeVisible();

  await lead.goto('/en/research/requests');
  const request = lead
    .getByTestId('requests-to-you')
    .getByRole('listitem')
    .filter({ hasText: RESIDENT_NAME })
    .filter({ hasText: title });
  await expect(request.getByText('Waiting for an answer')).toBeVisible();
  await expectAccessible(lead);
  await request.getByRole('button', { name: 'Accept' }).click();
  await expect(request.getByText('Accepted')).toBeVisible();

  // The resident reaches the project's group.
  await resident.goto('/en/research/requests');
  const mine = resident.getByTestId('requests-yours').getByRole('listitem').filter({
    hasText: title,
  });
  await expect(mine.getByText('Accepted')).toBeVisible();
  await expectAccessible(resident);
  await mine.getByRole('link', { name: `Project: ${title}` }).click();
  await expect(resident.getByText('You are in this project.')).toBeVisible();
  await resident.getByRole('link', { name: 'Open the project’s group' }).click();
  await expect(resident).toHaveURL(/\/en\/chat\/[0-9a-f-]+$/);

  // Ended, so runs don't pile up open projects.
  await lead.goto('/en/research/mine');
  await lead.getByRole('link', { name: title }).click();
  await lead.getByRole('button', { name: 'End the project' }).click();
  await lead
    .getByRole('group', { name: 'End the project' })
    .getByRole('button', { name: 'End the project' })
    .click();
  await expect(lead.getByText('Ended', { exact: true })).toBeVisible();
});

test('a resident finds projects in Hebrew', async ({ browser }) => {
  const reader = await memberPage(browser, RESIDENT, 'he');
  await reader.goto('/he/research');
  await expect(reader.getByRole('heading', { name: 'פרויקטי מחקר' })).toBeVisible();
  await expect(reader.getByTestId('projects-list').getByRole('listitem').first()).toBeVisible();
  await expectAccessible(reader);
  await reader.getByTestId('projects-list').getByRole('link').first().click();
  await expect(reader.getByText('פרסום פרויקט אינו מכיל נתונים על משתתפים.')).toBeVisible();
  await expectAccessible(reader);
});

test('a member types a publication into their profile, and removes it', async ({ browser }) => {
  const title = `A typed-in sample paper ${Date.now()}`;
  const member = await memberPage(browser, MEMBER);
  await member.goto('/en/account/profile');
  const section = member.getByRole('region', { name: 'Publications' });
  await section.getByRole('button', { name: 'Type it in' }).click();
  const form = section.getByTestId('publication-form');
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Authors').fill('Fictional authors');
  await form.getByLabel('Year').fill('2026');
  await expectAccessible(member);
  await form.getByRole('button', { name: 'Save' }).click();
  const saved = section.getByTestId('my-publications').getByRole('listitem').filter({
    hasText: title,
  });
  await expect(saved).toBeVisible();
  await expect(saved.getByText('Typed in')).toBeVisible();
  await saved.getByRole('button', { name: 'Remove' }).click();
  await expect(saved).toHaveCount(0);
});
