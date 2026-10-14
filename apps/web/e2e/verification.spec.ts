import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  PASSWORD,
  addVirtualAuthenticator,
  createAdmin,
  emailFromOutbox,
  expectSignedIn,
  linkFromOutbox,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M17 (docs/plans/M17-verification-and-onboarding.md): a physician who belongs to no
 * organisation finds the product, signs up, asks to be verified, and a reviewer checks the
 * register and decides. The licence number is never shown to the reviewer. Fictional people only.
 */
async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
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

async function register(page: Page, email: string) {
  await page.goto('/en/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const link = new URL(await linkFromOutbox(email, 'verifyEmail'));
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Your address is verified' })).toBeVisible();
}

test.setTimeout(300_000);

test('a visitor reads how a physician joins, in both languages', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('link', { name: 'How a physician joins' }).click();
  await expect(page).toHaveURL(/\/en\/about$/);
  await expect(page.getByRole('heading', { name: 'About Med Connect', level: 1 })).toBeVisible();
  await expect(page.getByText(/never shown to anyone, the reviewer included/)).toBeVisible();
  await expectAccessible(page);

  await page.goto('/he/about');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'אודות מד קונקט', level: 1 })).toBeVisible();
  await expectAccessible(page);
});

test('a physician asks to be verified; the reviewer checks the register and verifies', async ({
  browser,
}) => {
  const person = await newPage(browser);
  const reviewer = await newPage(browser, true);
  const email = uniqueEmail('m17-physician');
  const lastName = `Fictional-${Date.now() % 100000}`;
  const licence = String(Date.now() % 1_000_000_000);

  // The person: sign up; home says to ask first, and the directory is closed.
  await register(person, email);
  await signIn(person, 'en', email, PASSWORD);
  await expectSignedIn(person, email);
  await expect(person.getByTestId('first-steps')).toContainText('Ask to be verified');
  await person.goto('/en/account/profile');
  await person.getByLabel('First name', { exact: true }).fill('Yael');
  await person.getByLabel('Last name', { exact: true }).fill(lastName);
  await person.getByRole('button', { name: 'Save' }).click();
  await expect(person.getByText('Your profile was saved.')).toBeVisible();

  await person.goto('/en/account/verification');
  await expect(person.getByTestId('verification-status')).toContainText(
    'You are not verified yet.',
  );
  await person.getByLabel('I am').selectOption({ label: 'Resident' });
  await person.getByLabel('Medical licence number').fill(licence);
  await person.getByRole('button', { name: 'Send the request' }).click();
  await expect(person.getByText('Your request was sent')).toBeVisible();
  await expect(person.getByTestId('verification-status')).toContainText(
    'Your request is waiting for a reviewer.',
  );
  await expectAccessible(person);
  await emailFromOutbox(email, 'physicianVerificationReceived');

  // The reviewer: a role of its own, with two-step verification.
  const reviewerEmail = uniqueEmail('m17-reviewer');
  const reviewerPassword = createAdmin(reviewerEmail, 'VERIFIER');
  await signIn(reviewer, 'en', reviewerEmail, reviewerPassword);
  await expect(reviewer).toHaveURL(/\/en\/account\/security$/);
  await reviewer.getByLabel('Passkey name').fill('Laptop');
  await reviewer.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(reviewer.getByText('Passkey added.')).toBeVisible();

  await reviewer.goto('/en/admin/verifications');
  const item = reviewer.getByRole('listitem').filter({ hasText: `Yael ${lastName}` });
  await expect(item).toContainText('Resident');
  // The number the person gave appears nowhere on the reviewer's page.
  await expect(reviewer.getByRole('main')).not.toContainText(licence);
  await expectAccessible(reviewer);

  await item.getByLabel('What the register shows').selectOption({
    label: 'An active, permanent licence',
  });
  await item.getByLabel('Licence number, as the register shows it').fill('99999');
  await item.getByRole('button', { name: 'Verify' }).click();
  await expect(item.getByText('does not match the one the person gave')).toBeVisible();
  await item.getByLabel('Licence number, as the register shows it').fill(licence);
  await item.getByRole('button', { name: 'Verify' }).click();
  await expect(reviewer.getByText('Verified.', { exact: true })).toBeVisible();

  // The person is verified, marked as a resident, and the directory opens.
  await person.reload();
  await expect(person.getByTestId('verification-status')).toContainText(
    'You are verified as Resident.',
  );
  await emailFromOutbox(email, 'physicianVerificationApproved');
  await person.goto('/en');
  await expect(person.getByTestId('first-steps')).toContainText('First steps');
  await person.goto('/en/members');
  await expect(person.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(person.getByText('Members only')).toHaveCount(0);
});
