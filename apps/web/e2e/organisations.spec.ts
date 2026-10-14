import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { DEMO_ORGANISATION, expectSignedIn, signIn } from './helpers';

/**
 * M16 (docs/plans/M16-independent-platform.md §4.3): an organisation has a section of its own on
 * the site: who it is, the reader's membership and card, its news, events and rooms. The lists
 * of the whole platform say whose each item is. The demo member comes from the seed and is
 * fictional.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const MEMBER = 'member.full@demo.test';
const SECTION = `/organisations/${DEMO_ORGANISATION.slug}`;
const NAME = DEMO_ORGANISATION.name;

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test('a visitor reaches the organisation’s section; its rooms and membership stay closed', async ({
  page,
}) => {
  await page.goto('/en');
  // One organisation on the platform: the header's link opens its section directly.
  await page.getByTestId('organisations-link').click();
  await expect(page).toHaveURL(new RegExp(`/en${SECTION}$`));
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  await expect(page.getByTestId('organisation-membership')).toContainText(
    'Sign in to see your membership here, or to apply.',
  );
  await expect(page.getByTestId('organisation-rooms')).toContainText(
    'The rooms are open to the organisation’s members.',
  );
  await expectAccessible(page);

  // Its news, by itself, and the way back.
  await page.getByRole('link', { name: `All news of ${NAME}` }).click();
  await expect(page.getByRole('heading', { name: `News of ${NAME}`, level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: `Back to ${NAME}` }).click();
  await page.getByRole('link', { name: `All events of ${NAME}` }).click();
  await expect(page.getByRole('heading', { name: `Events of ${NAME}`, level: 1 })).toBeVisible();

  // The platform's own list says whose each item is.
  await page.goto('/en/news');
  await expect(page.getByTestId('news-list')).toBeVisible();
  for (const owner of await page.getByTestId('item-owner').allTextContents()) {
    expect(owner).toMatch(/^From .+/);
  }

  // The list of organisations, and an address that is nobody's.
  await page.goto('/en/organisations');
  await expect(
    page.getByTestId('organisation-list').getByRole('link', { name: NAME }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.goto('/en/organisations/no-such-organisation');
  await expect(
    page.getByRole('heading', { name: 'This organisation was not found.' }),
  ).toBeVisible();
});

test('a member sees their membership, card and rooms in the section', async ({ page }) => {
  await signIn(page, 'en', MEMBER, DEMO_PASSWORD);
  await expectSignedIn(page, MEMBER);
  await page.goto(`/en${SECTION}`);
  await expect(page.getByTestId('organisation-membership-state')).toContainText('Active');
  await expect(page.getByTestId('organisation-rooms').getByRole('link').first()).toBeVisible();
  await expectAccessible(page);

  // The card carries the organisation's name.
  await page.getByRole('link', { name: 'Membership card' }).click();
  await expect(page).toHaveURL(new RegExp(`/en${SECTION}/membership/card$`));
  await expect(page.getByTestId('membership-card')).toContainText(NAME);

  // The addresses from before the section lead into it.
  await page.goto('/he/account/membership');
  await expect(page).toHaveURL(new RegExp(`/he${SECTION}/membership$`));
  await expect(page.getByTestId('membership-summary')).toBeVisible();
});
