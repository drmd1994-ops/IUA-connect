import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  PASSWORD,
  addVirtualAuthenticator,
  createAdmin,
  emailFromOutbox,
  expectSignedIn,
  linkFromOutbox,
  linksOf,
  runJob,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M7 exit tests (docs/plans/M7-notifications-search.md §6). Notices in the app with the
 * member's own switches, the daily summary email and its unsubscribe link; a broadcast that
 * needs a second admin; the opt-in member directory; search in Hebrew. Plus axe on every new
 * page. The demo members come from the seed and are fictional.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
/** Listed in the directory by the seed, showing the Hebrew name, position and institution. */
const LISTED = { email: 'member.full@demo.test', hebrewName: 'נועה', position: 'Senior Urologist' };
const MEMBER = { email: 'member.resident@demo.test' };

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

test.setTimeout(300_000);

test('a person chooses what they get → sees a notice → gets the summary → unsubscribes', async ({
  browser,
}) => {
  const reader = await newPage(browser);
  const admin = await newPage(browser, true);
  const title = `Fictional guideline ${Date.now().toString().slice(-6)}`;
  const email = uniqueEmail('m7-reader');
  await registerAndSignIn(reader, email);

  // Email about guidelines starts switched off; the reader turns it on.
  await reader.goto('/en/account/notifications/preferences');
  const byEmail = reader.getByLabel('Guidelines: by email');
  await expect(byEmail).not.toBeChecked();
  await expect(reader.getByLabel('Guidelines: in the app')).toBeChecked();
  await expect(reader.getByLabel('Account and membership: by email')).toBeDisabled();
  await expectAccessible(reader);
  await byEmail.check();
  await reader.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(reader.getByText('Saved.')).toBeVisible();

  // An admin adds a guideline.
  const adminEmail = uniqueEmail('m7-guidelines');
  await signInAndAddPasskey(admin, adminEmail, createAdmin(adminEmail));
  await admin.goto('/en/admin/guidelines');
  await admin.getByRole('button', { name: 'Add a guideline' }).click();
  await admin.getByLabel('Source organisation').fill('Example Urology Society');
  await admin.getByLabel('Official link').fill('https://guidelines.example.test/m7');
  await admin.getByLabel('Title in English').fill(title);
  await admin.getByLabel('Version', { exact: true }).fill('2026');
  await admin.getByLabel('Publication date').fill('2026-03-01');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(admin.getByTestId('admin-guidelines')).toContainText(title);

  // The reader sees it on the bell and in the list, and opens it from there.
  await reader.goto('/en/account/notifications');
  await expect(reader.getByTestId('notification-count')).toBeVisible();
  const notice = reader.getByTestId('notice-list').getByRole('listitem').filter({ hasText: title });
  await expect(notice).toContainText(`New guideline: ${title}`);
  await expect(notice).toContainText('New');
  await expectAccessible(reader);
  await notice.getByRole('link', { name: `New guideline: ${title}` }).click();
  await expect(reader.getByTestId('guideline').getByRole('heading', { name: title })).toBeVisible();
  // Opening it marked it as read.
  await reader.goto('/en/account/notifications');
  await expect(
    reader.getByTestId('notice-list').getByRole('listitem').filter({ hasText: title }),
  ).not.toContainText('Mark as read');

  // The daily summary lists it, and ends with a link that stops these emails.
  runJob('notifications.content-digest');
  const summary = await emailFromOutbox(email, 'contentDigest');
  expect(summary).toContain(title);
  const unsubscribe = linksOf(summary).find((link) => link.includes('/notifications/unsubscribe'));
  expect(unsubscribe).toBeDefined();
  const visitor = await newPage(browser);
  const target = new URL(unsubscribe!);
  await visitor.goto(target.pathname + target.search);
  await expect(visitor.getByTestId('unsubscribed')).toContainText('Guidelines');
  await expectAccessible(visitor);

  await reader.goto('/en/account/notifications/preferences');
  await expect(reader.getByLabel('Guidelines: by email')).not.toBeChecked();
  await expect(reader.getByLabel('Guidelines: in the app')).toBeChecked();
});

test('a message to members is sent only after a second admin approves it', async ({ browser }) => {
  const author = await newPage(browser, true);
  const approver = await newPage(browser, true);
  const member = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const title = { en: `Test message ${suffix}`, he: `הודעת בדיקה ${suffix}` };

  const authorEmail = uniqueEmail('m7-author');
  await signInAndAddPasskey(author, authorEmail, createAdmin(authorEmail));
  const approverEmail = uniqueEmail('m7-approver');
  await signInAndAddPasskey(approver, approverEmail, createAdmin(approverEmail));

  // The author writes it in both languages and submits it.
  await author.goto('/en/admin/broadcasts/new');
  await expectAccessible(author);
  await author.getByLabel('Title', { exact: true }).fill(title.he);
  await author.getByLabel('Text', { exact: true }).fill('פסקה ראשונה.\n\nפסקה שנייה.');
  await author.getByRole('tab', { name: 'English' }).click();
  await author.getByLabel('Title', { exact: true }).fill(title.en);
  await author.getByLabel('Text', { exact: true }).fill('First paragraph.\n\nSecond paragraph.');
  await author.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(author.getByTestId('broadcast-status')).toHaveText('Draft');
  await author.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(author.getByTestId('broadcast-status')).toHaveText('Waiting for approval');
  // The author can't approve their own message.
  await expect(author.getByText('A different administrator must approve it.')).toBeVisible();
  await expect(author.getByRole('button', { name: 'Approve and send' })).toHaveCount(0);
  await expectAccessible(author);

  // Nothing has reached the member yet.
  await signIn(member, 'en', MEMBER.email, DEMO_PASSWORD);
  await expectSignedIn(member, MEMBER.email);
  await member.goto('/en/account/notifications');
  await expect(member.getByTestId('notice-summary')).toBeVisible();
  await expect(member.getByText(title.en)).toHaveCount(0);

  // A second admin sees who it would reach, and approves.
  await approver.goto('/en/admin/broadcasts');
  await expectAccessible(approver);
  await approver.getByTestId('broadcasts-table').getByRole('link', { name: title.en }).click();
  await expect(approver.getByTestId('broadcast-audience')).toContainText('if sent now');
  await approver.getByRole('button', { name: 'Approve and send' }).click();
  await expect(approver.getByTestId('broadcast-status')).toHaveText('Sent');
  await expect(approver.getByTestId('broadcast-sent')).toContainText('Approved by');
  await expectAccessible(approver);

  // The member finds it among their notices and reads it.
  await member.reload();
  const notice = member
    .getByTestId('notice-list')
    .getByRole('link', { name: `A message from the association: ${title.en}` });
  await notice.click();
  const message = member.getByTestId('broadcast-message');
  await expect(message.getByRole('heading', { name: title.en })).toBeVisible();
  await expect(message).toContainText('Second paragraph.');
  await expectAccessible(member);

  // The email follows from the job.
  runJob('notifications.deliver-broadcasts');
  const mail = await emailFromOutbox(MEMBER.email, 'broadcast');
  expect(mail.includes(title.he) || mail.includes(title.en)).toBe(true);
});

test('a member joins the directory; another member finds people by name in Hebrew', async ({
  browser,
}) => {
  const member = await newPage(browser);
  const outsider = await newPage(browser);

  // Signed out, and signed in with an account that is not verified: no directory.
  await outsider.goto('/en/members');
  await expect(outsider.getByText('Please sign in to view this page.')).toBeVisible();
  await registerAndSignIn(outsider, uniqueEmail('m7-outsider'));
  await outsider.goto('/en/members');
  await expect(
    outsider.getByText('The directory is open to physicians whose account has been verified.'),
  ).toBeVisible();
  await expect(outsider.getByTestId('directory-list')).toHaveCount(0);
  await expectAccessible(outsider);

  // A member leaves the directory (if listed) and joins again from their profile.
  await signIn(member, 'en', MEMBER.email, DEMO_PASSWORD);
  await expectSignedIn(member, MEMBER.email);
  await member.goto('/en/account/profile');
  const optIn = member.getByTestId('directory-opt-in');
  await expect(optIn.getByTestId('directory-state')).toBeVisible();
  const leave = optIn.getByRole('button', { name: 'Remove me from the directory' });
  if (await leave.isVisible()) {
    await leave.click();
    await expect(optIn.getByText('You are no longer listed.')).toBeVisible();
  }
  await expect(optIn.getByTestId('directory-state')).toHaveText(
    'You are not listed in the member directory.',
  );
  await optIn.getByRole('button', { name: 'List me in the directory' }).click();
  await expect(optIn.getByText('You are now listed.')).toBeVisible();
  await expectAccessible(member);

  // They search the directory in Hebrew and open a member who shows more than a name.
  await member.goto('/he/members');
  await member.getByLabel('חיפוש לפי שם').fill(LISTED.hebrewName);
  await member.getByRole('main').getByRole('button', { name: 'חיפוש', exact: true }).click();
  const found = member.getByTestId('directory-list').getByRole('link');
  await expect(found).toHaveCount(1);
  await expect(found).toContainText(LISTED.hebrewName);
  await expectAccessible(member);
  await found.click();
  const profile = member.getByTestId('directory-member');
  await expect(profile.getByRole('heading', { level: 1 })).toContainText(LISTED.hebrewName);
  await expect(profile).toContainText(LISTED.position);
  // The address is private: it is not on the page.
  await expect(profile).not.toContainText(LISTED.email);
  await expectAccessible(member);
});

test('a visitor searches in Hebrew from the header and opens a result', async ({ browser }) => {
  const visitor = await newPage(browser);
  await visitor.goto('/he');
  await visitor.getByRole('searchbox', { name: 'חיפוש באתר' }).fill('בכנס');
  await visitor.getByRole('banner').getByRole('button', { name: 'חיפוש', exact: true }).click();
  await expect(visitor).toHaveURL(/\/he\/search\?q=/);
  const news = visitor.getByTestId('search-group-news');
  // "בכנס" (at the meeting) finds the item whose title says "לכנס" (for the meeting).
  const result = news.getByRole('link', { name: 'נפתחה ההרשמה לכנס השנתי (הדגמה)' });
  await expect(result).toBeVisible();
  // Members are not part of a visitor's results.
  await expect(visitor.getByTestId('search-group-members')).toHaveCount(0);
  await expectAccessible(visitor);
  await result.click();
  await expect(
    visitor
      .getByTestId('news-article')
      .getByRole('heading', { name: 'נפתחה ההרשמה לכנס השנתי (הדגמה)' }),
  ).toBeVisible();

  // Nothing found, and too short a query, both say so.
  await visitor.goto('/en/search?q=zzzznothingzzzz');
  await expect(visitor.getByText('Nothing was found for “zzzznothingzzzz”.')).toBeVisible();
  await visitor.goto('/en/search');
  await expect(visitor.getByText('Type at least two characters.')).toBeVisible();
  await expectAccessible(visitor);
});
