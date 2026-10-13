import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  PASSWORD,
  addVirtualAuthenticator,
  createAdmin,
  expectSignedIn,
  linkFromOutbox,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M8 exit tests (docs/plans/M8-admin-dashboard.md §6): the admin dashboard and its tiles;
 * disabling an account and finding the action in the audit log; giving a role; the site
 * settings; and the member dashboard with its "Coming soon" actions. Plus axe on every new
 * page. The demo member comes from the seed and is fictional.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const MEMBER = { email: 'member.full@demo.test' };

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

/** First sign-in of a staff account: its role requires two-step verification, so add a passkey. */
async function signInAndAddPasskey(page: Page, email: string, password: string) {
  await signIn(page, 'en', email, password);
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
}

/** A new account with a verified address, signed in. */
async function registerAndSignIn(page: Page, email: string) {
  await page.goto('/en/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const link = new URL(await linkFromOutbox(email, 'verifyEmail'));
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Your address is verified' })).toBeVisible();
  await signIn(page, 'en', email, PASSWORD);
  await expectSignedIn(page, email);
}

/** Finds an account in the admin list and opens its page. */
async function openAccount(admin: Page, email: string) {
  await admin.goto('/en/admin/users');
  await admin.getByLabel('Search by email or name').fill(email);
  await admin.getByRole('main').getByRole('button', { name: 'Search', exact: true }).click();
  await admin.getByTestId('accounts-table').getByRole('link', { name: email }).click();
  await expect(admin.getByTestId('account-email')).toHaveText(email);
}

test.setTimeout(300_000);

test('an admin follows the dashboard, disables an account, finds it in the audit log, gives a role', async ({
  browser,
}) => {
  const admin = await newPage(browser, true);
  const person = await newPage(browser);
  const adminEmail = uniqueEmail('m8-super');
  await signInAndAddPasskey(admin, adminEmail, createAdmin(adminEmail));
  const personEmail = uniqueEmail('m8-person');
  await registerAndSignIn(person, personEmail);

  // The dashboard shows what is waiting, and each tile leads to its list.
  await admin.goto('/en/admin');
  const dashboard = admin.getByTestId('admin-dashboard');
  await expect(dashboard.getByRole('heading', { name: 'Membership applications' })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Waiting for review' })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(dashboard.getByTestId('tile-applications')).toContainText(
    'waiting for the association',
  );
  await expectAccessible(admin);
  await dashboard.getByRole('link', { name: 'Open the messages' }).click();
  await expect(admin.getByRole('heading', { name: 'Messages to members', level: 1 })).toBeVisible();

  // Disabling: a reason is needed; the person is signed out and can't sign in.
  await openAccount(admin, personEmail);
  await expectAccessible(admin);
  await expect(admin.getByTestId('account-status')).toContainText('Active');
  const disable = admin.getByRole('button', { name: 'Disable the account' });
  await expect(disable).toBeDisabled();
  await admin.getByLabel('Reason').fill('Asked for by the end-to-end test.');
  await disable.click();
  await expect(admin.getByTestId('account-status')).toContainText('Disabled');
  await expect(admin.getByTestId('account-sessions')).toHaveText('0');

  await person.goto('/en/account/notifications');
  await expect(person.getByText('Please sign in to view this page.')).toBeVisible();
  await signIn(person, 'en', personEmail, PASSWORD);
  await expect(person.getByRole('main').getByRole('alert')).toContainText(
    'This account has been disabled.',
  );

  // The action is in the audit log, with the reason.
  await admin.getByRole('link', { name: 'This account in the audit log' }).click();
  const log = admin.getByTestId('audit-table');
  await expect(log).toContainText('account.disable');
  await expect(log).toContainText('Asked for by the end-to-end test.');
  await expect(log).toContainText(adminEmail);
  await expectAccessible(admin);

  // Enabling restores it; then the account is given a role.
  await openAccount(admin, personEmail);
  await admin.getByLabel('Reason').fill('Test finished.');
  await admin.getByRole('button', { name: 'Enable the account' }).click();
  await expect(admin.getByTestId('account-status')).toContainText('Active');
  await admin.getByLabel('Reason').fill('Joins the editorial team (test).');
  await admin.getByLabel('Give a role').selectOption({ label: 'Content editor' });
  await admin.getByRole('button', { name: 'Give', exact: true }).click();
  await expect(admin.getByTestId('account-roles-list')).toContainText('Content editor');

  await admin.goto('/en/admin/users/roles');
  await expect(admin.getByTestId('roles-table')).toContainText('Give and remove roles');
  await expectAccessible(admin);
});

test('a super admin changes the settings; every page shows them', async ({ browser }) => {
  const admin = await newPage(browser, true);
  const visitor = await newPage(browser);
  const adminEmail = uniqueEmail('m8-settings');
  await signInAndAddPasskey(admin, adminEmail, createAdmin(adminEmail));
  const suffix = Date.now().toString().slice(-6);
  const notice = { en: `Test notice ${suffix}`, he: `הודעת בדיקה ${suffix}` };

  await admin.goto('/en/admin/settings');
  const email = admin.getByLabel('Email', { exact: true });
  await expect(email).toBeVisible();
  await expectAccessible(admin);
  // What was there before, to put back at the end.
  const show = admin.getByLabel('Show the notice');
  const before = {
    email: await email.inputValue(),
    shown: await show.isChecked(),
    he: await admin.getByLabel('Notice in Hebrew').inputValue(),
    en: await admin.getByLabel('Notice in English').inputValue(),
  };

  await email.fill(`office-${suffix}@example.test`);
  await show.check();
  await admin.getByLabel('Notice in Hebrew').fill(notice.he);
  await admin.getByLabel('Notice in English').fill(notice.en);
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(admin.getByText('Saved.')).toBeVisible();

  await visitor.goto('/en');
  await expect(visitor.getByTestId('site-notice')).toHaveText(notice.en);
  await expect(visitor.getByTestId('footer-contact')).toContainText(
    `office-${suffix}@example.test`,
  );
  await expectAccessible(visitor);
  await visitor.goto('/he');
  await expect(visitor.getByTestId('site-notice')).toHaveText(notice.he);
  await expectAccessible(visitor);

  // Back to how it was.
  await email.fill(before.email);
  await admin.getByLabel('Notice in Hebrew').fill(before.he);
  await admin.getByLabel('Notice in English').fill(before.en);
  await show.setChecked(before.shown);
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(admin.getByText('Saved.')).toBeVisible();
  if (!before.shown) {
    await visitor.reload();
    await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(visitor.getByTestId('site-notice')).toHaveCount(0);
  }
});

test('a member lands on their dashboard; later features are shown but can’t be used', async ({
  browser,
}) => {
  const visitor = await newPage(browser);
  const member = await newPage(browser);

  // A visitor gets the public home page.
  await visitor.goto('/en');
  await expect(
    visitor.getByRole('heading', { name: 'A professional home for urologists in Israel' }),
  ).toBeVisible();
  await expect(visitor.getByTestId('member-dashboard')).toHaveCount(0);

  await signIn(member, 'en', MEMBER.email, DEMO_PASSWORD);
  await expectSignedIn(member, MEMBER.email);
  await member.goto('/en');
  const dashboard = member.getByTestId('member-dashboard');
  await expect(dashboard.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible();
  await expect(dashboard.getByTestId('home-membership-state')).toContainText('active until');
  for (const title of ['Notifications', 'Upcoming events', 'News', 'Education', 'Quick actions']) {
    await expect(dashboard.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(dashboard.getByRole('link', { name: 'All news' })).toBeVisible();
  await expectAccessible(member);

  // "Coming soon" actions are labelled, and are neither links nor buttons.
  const later = dashboard.getByTestId('coming-soon-actions');
  await expect(later.getByRole('listitem')).toHaveCount(4);
  await expect(later).toContainText('Create a case');
  await expect(later.getByText('Coming soon')).toHaveCount(4);
  await expect(later.getByRole('link')).toHaveCount(0);
  await expect(later.getByRole('button')).toHaveCount(0);

  // A working action goes somewhere.
  await dashboard.getByRole('link', { name: 'Find a colleague' }).click();
  await expect(member.getByRole('heading', { name: 'Member directory', level: 1 })).toBeVisible();

  // The same dashboard in Hebrew, right to left.
  await member.goto('/he');
  await expect(
    member.getByTestId('member-dashboard').getByRole('heading', { name: 'ברוכים השבים' }),
  ).toBeVisible();
  await expectAccessible(member);
});
