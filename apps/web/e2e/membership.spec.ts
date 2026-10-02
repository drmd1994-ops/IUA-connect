import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  PASSWORD,
  addVirtualAuthenticator,
  createAdmin,
  linkFromOutbox,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M2 exit test (docs/plans/M2-people-membership.md §1): register → the department director
 * approves → an IUA admin approves → the membership card verifies. Three people, each in their own
 * browser; the admin and the director set up a passkey (their roles require two-step verification).
 */
const HOSPITAL = 'Barzilai Medical Center';
const DEPARTMENT = 'Department of Urology';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

async function newPage(browser: Browser, passkey = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (passkey) await addVirtualAuthenticator(page);
  return page;
}

/** Signs up through the form and follows the emailed verification link. */
async function register(page: Page, email: string) {
  await page.goto('/en/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const link = new URL(await linkFromOutbox(email, 'verifyEmail'));
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Your address is verified' })).toBeVisible();
}

/** First sign-in of an account whose role needs two-step verification: add a passkey. */
async function signInAndAddPasskey(page: Page, email: string, password: string) {
  await signIn(page, 'en', email, password);
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
}

test.setTimeout(240_000);

test('register → director approves → admin approves → the card verifies', async ({ browser }) => {
  const admin = await newPage(browser, true);
  const director = await newPage(browser, true);
  const member = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const lastName = `Fictional${suffix}`;
  // Its own digits, so checking that it never appears can't match the name or the email.
  const certificate = String(100_000_000 + Math.floor(Math.random() * 900_000_000));

  // The admin: first sign-in adds a passkey.
  const adminEmail = uniqueEmail('m2-admin');
  await signInAndAddPasskey(admin, adminEmail, createAdmin(adminEmail));

  // The director signs up; the admin makes them director of the department.
  const directorEmail = uniqueEmail('m2-director');
  await register(director, directorEmail);
  await admin.goto('/en/admin/institutions');
  await admin.getByLabel('Filter hospitals').fill('Barzilai');
  await admin.getByText(HOSPITAL).click();
  const department = admin.getByRole('region', { name: DEPARTMENT });
  await department.getByLabel('Director’s account email').fill(directorEmail);
  await department.getByRole('button', { name: 'Assign director' }).click();
  await expect(department).toContainText(directorEmail);
  await expectAccessible(admin);

  // The director's role needs two-step verification: a passkey at first sign-in.
  await signInAndAddPasskey(director, directorEmail, PASSWORD);

  // The member: sign up, fill in the profile, apply.
  const memberEmail = uniqueEmail('m2-member');
  await register(member, memberEmail);
  await signIn(member, 'en', memberEmail, PASSWORD);
  await expect(member.getByRole('button', { name: /Account menu/ })).toContainText(memberEmail);
  await member.goto('/en/account/profile');
  await member.getByLabel('First name', { exact: true }).fill('Dana');
  await member.getByLabel('Last name', { exact: true }).fill(lastName);
  await member.getByRole('button', { name: 'Save' }).click();
  await expect(member.getByText('Your profile was saved.')).toBeVisible();
  await expectAccessible(member);

  await member.goto('/en/account/membership');
  await member.getByLabel('Membership type').selectOption({ label: 'Full member' });
  await member.getByLabel('Hospital').selectOption({ label: HOSPITAL });
  await member.getByLabel('Department').selectOption({ label: DEPARTMENT });
  await member.getByLabel('Specialist certificate number').fill(certificate);
  await member.getByRole('button', { name: 'Submit application' }).click();
  await expect(member.getByTestId('application')).toContainText(
    'Waiting for the department director',
  );
  await expectAccessible(member);

  // The director approves.
  await director.goto('/en/account/applications');
  const forDirector = director.getByRole('listitem', { name: `Dana ${lastName}` });
  await expect(forDirector).toContainText('Number provided');
  await expect(forDirector).not.toContainText(certificate); // the number itself is never shown
  await expectAccessible(director);
  await forDirector.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(director.getByText('The application was approved.')).toBeVisible();

  // The admin gives final approval.
  await admin.goto('/en/admin/applications');
  const forAdmin = admin.getByRole('listitem', { name: `Dana ${lastName}` });
  await expect(forAdmin).toContainText('Department director approved');
  await expectAccessible(admin);
  await forAdmin.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(admin.getByText('The application was approved.')).toBeVisible();

  // The member now has an active membership and a card.
  await member.goto('/en/account/membership');
  await expect(member.getByTestId('membership-summary')).toContainText('Active');
  const tokenResponse = member.waitForResponse('**/api/v1/me/membership/card-token');
  await member.getByRole('link', { name: 'Show my membership card' }).click();
  const { token } = (await (await tokenResponse).json()) as { token: string };
  await expect(
    member.getByRole('img', { name: `QR code for verifying the membership of Dana ${lastName}` }),
  ).toBeVisible();
  await expectAccessible(member);

  // Anyone scanning the code sees a valid membership: name and type only.
  const scanner = await newPage(browser);
  await scanner.goto(`/he/card/verify?t=${encodeURIComponent(token)}`);
  const verification = scanner.getByTestId('verification');
  await expect(verification).toContainText('חברות בתוקף');
  await expect(verification).toContainText(`Dana ${lastName}`);
  await expect(verification).toContainText('חברות מלאה');
  await expect(verification).not.toContainText(certificate);
  await expectAccessible(scanner);

  // The admin sees the new member, and suspending them invalidates the card at once.
  await admin.goto('/en/admin/members');
  await admin.getByLabel('Search by name or email').fill(memberEmail);
  await admin.getByRole('main').getByRole('button', { name: 'Search' }).click();
  await admin.getByRole('link', { name: `Dana ${lastName}` }).click();
  await expect(admin.getByTestId('member-detail')).toContainText('Full member');
  await expectAccessible(admin);
  await admin.getByLabel('Reason').fill('Demo suspension');
  await admin.getByRole('button', { name: 'Suspend' }).click();
  await expect(admin.getByTestId('member-detail')).toContainText('Suspended');
  await scanner.reload();
  await expect(scanner.getByTestId('verification')).toContainText('לא בתוקף');
});

test('the verification page explains itself without a code, in Hebrew', async ({ page }) => {
  await page.goto('/he/card/verify');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('הדף הזה בודק קוד מכרטיס חבר.', { exact: false })).toBeVisible();
  await expectAccessible(page);
});
