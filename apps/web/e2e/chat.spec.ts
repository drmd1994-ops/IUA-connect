import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Locator, type Page, expect, test } from '@playwright/test';
import {
  addVirtualAuthenticator,
  createAdmin,
  expectSignedIn,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * M11 exit tests (docs/plans/M11-chat.md §7): two members write to each other in two browser
 * windows and see each other's messages, edits and deletions arrive without refreshing; mute,
 * archive, mark as unread and search; blocking and reporting, with staff deleting a message
 * and suspending a person; a third member can't open the conversation; the phone layout.
 * Plus axe on every chat page. The demo members come from the seed and are fictional; the
 * tests leave them as they found them (nobody blocked, nobody suspended).
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const NOA = { email: 'member.full@demo.test', name: 'Noa Bar-Lev' };
const RUTH = { email: 'member.honorary@demo.test', name: 'Ruth Golan' };
const YOAV = { email: 'member.resident@demo.test', name: 'Yoav Sela' };

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function memberPage(browser: Browser, locale: 'he' | 'en', email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, locale, email, DEMO_PASSWORD);
  await expectSignedIn(page, email);
  return page;
}

/** Opens the chat and the conversation with a person; answers its address. */
async function openConversation(page: Page, locale: 'he' | 'en', name: string): Promise<string> {
  await page.goto(`/${locale}/chat`);
  await page.getByTestId('conversation-list').getByRole('link', { name }).click();
  await expect(page.getByTestId('chat-with')).toHaveText(name);
  await expect(page.getByTestId('message-log')).toBeVisible();
  return new URL(page.url()).pathname;
}

const log = (page: Page) => page.getByTestId('message-log');
const messageWith = (page: Page, text: string) =>
  log(page).getByTestId('message').filter({ hasText: text });

async function send(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).fill(text);
  await page.getByLabel(label, { exact: true }).press('Enter');
  await expect(messageWith(page, text)).toBeVisible();
}

async function menu(page: Page, message: Locator, open: string, action: string) {
  await message.getByRole('button', { name: open }).click();
  await page.getByTestId('message-menu').getByRole('button', { name: action, exact: true }).click();
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.setTimeout(180_000);

// A person may hold three live chat connections. Windows left open by an earlier test would
// take them, and the next test's page would keep losing its own.
test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test('two members write to each other and see it arrive without refreshing', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const noa = await memberPage(browser, 'he', NOA.email);
  const ruth = await memberPage(browser, 'en', RUTH.email);
  await openConversation(noa, 'he', RUTH.name);
  await openConversation(ruth, 'en', NOA.name);
  await expectAccessible(noa);
  await expectAccessible(ruth);

  // Noa types: Ruth is told. Then the message arrives on Ruth's open page.
  const hello = `שלום, הודעת בדיקה ${tag}`;
  await noa.getByLabel('הודעה', { exact: true }).pressSequentially('שלום');
  await expect(ruth.getByText(`${NOA.name} is typing…`)).toBeVisible();
  await send(noa, 'הודעה', hello);
  // The exit criterion: within two seconds, with no refresh.
  await expect(messageWith(ruth, hello)).toBeVisible({ timeout: 2_000 });

  // Ruth is looking at it, so Noa's message becomes "read".
  await expect(messageWith(noa, hello).getByTestId('message-status')).toHaveAttribute(
    'data-status',
    'read',
  );

  // Ruth replies to that message; Noa sees the reply with its quote.
  const answer = `Got it, test reply ${tag}`;
  await menu(ruth, messageWith(ruth, hello), 'Actions for this message', 'Reply');
  await expect(ruth.getByTestId('composer-banner')).toHaveText(`Replying to ${NOA.name}`);
  await send(ruth, 'Message', answer);
  const reply = messageWith(noa, answer);
  await expect(reply).toBeVisible();
  await expect(reply).toContainText(hello);

  // Noa edits her message; Ruth sees the new text, marked as edited.
  const edited = `שלום, הודעה מתוקנת ${tag}`;
  await menu(noa, messageWith(noa, hello).first(), 'פעולות על ההודעה', 'עריכה');
  await expect(noa.getByTestId('composer-banner')).toHaveText('עריכת ההודעה שלך');
  await noa.getByLabel('הודעה', { exact: true }).fill(edited);
  await noa.getByRole('button', { name: 'שמירה', exact: true }).click();
  const forRuth = messageWith(ruth, edited).first();
  await expect(forRuth).toBeVisible();
  await expect(forRuth).toContainText('edited');

  // Ruth deletes her reply for herself only: Noa still has it.
  await menu(ruth, messageWith(ruth, answer), 'Actions for this message', 'Delete for me');
  await ruth.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(messageWith(ruth, answer)).toHaveCount(0);
  await expect(messageWith(noa, answer)).toBeVisible();

  // Noa deletes her message for everyone: both see that it was deleted, and its text is gone.
  await menu(noa, messageWith(noa, edited).first(), 'פעולות על ההודעה', 'מחיקה אצל כולם');
  await noa.getByRole('dialog').getByRole('button', { name: 'מחיקה', exact: true }).click();
  await expect(messageWith(noa, edited)).toHaveCount(0);
  await expect(log(ruth).getByText(edited)).toHaveCount(0);
  await expect(log(ruth).getByText('This message was deleted').last()).toBeVisible();

  // A message that arrives while Ruth is elsewhere shows as a number on the Chat link.
  await ruth.goto('/en/account/profile');
  await send(noa, 'הודעה', `עוד הודעה ${tag}`);
  await ruth.reload();
  await expect(ruth.getByTestId('chat-count')).toHaveText('1');
  await ruth.getByTestId('chat-link').click();
  await expect(ruth.getByTestId('conversation-list').getByTestId('unread-count')).toBeVisible();
  await expectAccessible(ruth);
});

test('mute, archive, mark as unread, and search', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6);
  const yoav = await memberPage(browser, 'en', YOAV.email);
  await openConversation(yoav, 'en', NOA.name);
  const word = `findme${tag}`;
  await send(yoav, 'Message', `A sentence to ${word} later`);

  // Mute for a week: the list says so.
  await yoav.getByRole('button', { name: 'Details' }).click();
  const details = yoav.getByRole('dialog');
  await expectAccessible(yoav);
  await details.getByLabel('Notices about this conversation').selectOption('week');
  await expect(details.getByLabel('Notices about this conversation')).toHaveValue('timed');
  await details.getByRole('button', { name: 'Close' }).click();
  const row = yoav.getByTestId('conversation-list').getByRole('link', { name: NOA.name });
  await expect(row).toContainText('Muted');
  await yoav.getByRole('button', { name: 'Details' }).click();
  await yoav.getByRole('dialog').getByLabel('Notices about this conversation').selectOption('off');
  await expect(row).not.toContainText('Muted');

  // Search inside the conversation.
  await yoav
    .getByRole('dialog')
    .getByRole('button', { name: 'Search in this conversation' })
    .click();
  const search = yoav.getByRole('dialog');
  await search.getByLabel('Words to find').fill(word);
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByTestId('chat-search-results')).toContainText(`A sentence to ${word}`);
  await search.getByRole('button', { name: 'Close' }).click();

  // Archive: it leaves the list and is found under "Archived"; then back.
  await yoav.getByRole('button', { name: 'Details' }).click();
  await yoav.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(row).toHaveCount(0);
  await yoav.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(row).toBeVisible();
  await yoav.getByRole('button', { name: 'Details' }).click();
  await yoav.getByRole('dialog').getByRole('button', { name: 'Take out of the archive' }).click();
  await yoav.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(row).toBeVisible();

  // Mark as unread: back in the list, with the mark; opening it takes the mark off.
  await yoav.getByRole('button', { name: 'Details' }).click();
  await yoav.getByRole('dialog').getByRole('button', { name: 'Mark as unread' }).click();
  await expect(yoav).toHaveURL(/\/en\/chat$/);
  await expect(row).toContainText('Marked as unread');
  await row.click();
  await expect(yoav.getByTestId('chat-with')).toHaveText(NOA.name);
  await expect(row).not.toContainText('Marked as unread');

  // Someone who can't be written to is simply not found. (The seed has Yoav block Ruth.)
  await yoav.getByRole('button', { name: 'New conversation' }).click();
  const start = yoav.getByRole('dialog');
  await expectAccessible(yoav);
  await start.getByLabel('Search by name').fill('Golan');
  await start.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(start.getByText('Nobody was found.', { exact: false })).toBeVisible();
  await start.getByLabel('Search by name').fill('Bar-Lev');
  await start.getByRole('button', { name: 'Search', exact: true }).click();
  await start.getByRole('button', { name: `Write to ${NOA.name}` }).click();
  await expect(yoav.getByTestId('chat-with')).toHaveText(NOA.name);

  // Chat settings.
  await yoav.goto('/en/account/chat');
  await expect(yoav.getByRole('heading', { name: 'Chat settings' })).toBeVisible();
  await expect(yoav.getByTestId('blocked-list')).toContainText(RUTH.name);
  await expect(yoav.getByLabel('Show others when I am typing')).toBeChecked();
  await expectAccessible(yoav);
});

test('blocking, reporting, and what staff do about a report', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6);
  const noa = await memberPage(browser, 'en', NOA.email);
  const yoav = await memberPage(browser, 'en', YOAV.email);
  const path = await openConversation(noa, 'en', YOAV.name);
  await openConversation(yoav, 'en', NOA.name);

  // A third member who knows the address still can't open the conversation.
  const ruth = await memberPage(browser, 'en', RUTH.email);
  await ruth.goto(path);
  await expect(ruth.getByText('The page or item you requested was not found.')).toBeVisible();
  await expect(ruth.getByTestId('message-log')).toHaveCount(0);

  // Yoav writes something; Noa reports the message and the person.
  const unwanted = `An unwanted test message ${tag}`;
  await send(yoav, 'Message', unwanted);
  await expect(messageWith(noa, unwanted)).toBeVisible();
  await menu(noa, messageWith(noa, unwanted), 'Actions for this message', 'Report');
  const report = noa.getByRole('dialog');
  await expect(report.getByRole('heading', { name: 'Report this message' })).toBeVisible();
  await expectAccessible(noa);
  await report.getByLabel('Reason').selectOption({ label: 'Spam or advertising' });
  await report.getByLabel('What happened (optional)').fill(`Test report ${tag}`);
  await report.getByRole('button', { name: 'Send the report' }).click();
  await expect(report.getByText('Your report was sent', { exact: false })).toBeVisible();
  await report.getByRole('button', { name: 'Close' }).last().click();

  await noa.getByRole('button', { name: 'Details' }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Report this person' }).click();
  const person = noa.getByRole('dialog');
  await expect(person.getByRole('heading', { name: `Report ${YOAV.name}` })).toBeVisible();
  await person.getByLabel('Reason').selectOption({ label: 'Harassment or abuse' });
  await person.getByLabel('What happened (optional)').fill(`Test report about a person ${tag}`);
  await person.getByRole('button', { name: 'Send the report' }).click();
  await person.getByRole('button', { name: 'Close' }).last().click();

  // Noa blocks Yoav: she can't send, and his message is refused without saying why.
  await noa.getByRole('button', { name: 'Details' }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Block this person' }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Block', exact: true }).click();
  await expect(noa.getByText('You blocked this person.', { exact: false })).toBeVisible();
  await expect(noa.getByLabel('Message', { exact: true })).toHaveCount(0);
  await yoav.getByLabel('Message', { exact: true }).fill(`Refused ${tag}`);
  await yoav.getByLabel('Message', { exact: true }).press('Enter');
  await expect(yoav.getByText('This message can’t be delivered.')).toBeVisible();
  await expect(messageWith(noa, `Refused ${tag}`)).toHaveCount(0);
  await noa.getByRole('button', { name: 'Unblock' }).click();
  await expect(noa.getByLabel('Message', { exact: true })).toBeVisible();

  // Staff: the queue, the report with the kept messages, and the decision.
  const admin = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(admin);
  const adminEmail = uniqueEmail('m11-chat');
  await signIn(admin, 'en', adminEmail, createAdmin(adminEmail));
  await expect(admin).toHaveURL(/\/en\/account\/security$/);
  await admin.getByLabel('Passkey name').fill('Laptop');
  await admin.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(admin.getByText('Passkey added.')).toBeVisible();

  await admin.goto('/en/admin');
  await expect(admin.getByTestId('tile-chat')).toContainText('waiting for a decision');
  await admin.goto('/en/admin/chat/reports');
  await expect(admin.getByRole('heading', { name: 'Chat reports' })).toBeVisible();
  await expectAccessible(admin);
  const rows = admin.getByTestId('chat-reports-table').getByRole('row');
  // The newest open reports are first: the one about the person, then the one about the message.
  await rows
    .filter({ hasText: 'A message' })
    .filter({ hasText: YOAV.name })
    .first()
    .getByRole('link')
    .click();
  await expect(admin.getByTestId('chat-report')).toContainText('Spam or advertising');
  await expect(admin.getByText(`Test report ${tag}`)).toBeVisible();
  const kept = admin.getByTestId('report-messages');
  await expect(kept.locator('[data-reported="true"]')).toContainText(unwanted);
  await expectAccessible(admin);
  await admin.getByLabel('Delete the reported message for both people').check();
  await admin.getByLabel('Reason', { exact: true }).fill('Advertising is not allowed here.');
  await admin.getByRole('button', { name: 'Decide' }).click();
  await expect(admin.getByTestId('chat-report')).toContainText('Upheld');
  // Both people see, without refreshing, that the message is gone.
  await expect(log(noa).getByText(unwanted)).toHaveCount(0);
  await expect(log(yoav).getByText(unwanted)).toHaveCount(0);

  // The report about the person: suspended for a day. Yoav is told and can't send.
  await admin.goto('/en/admin/chat/reports');
  await rows
    .filter({ hasText: 'A person' })
    .filter({ hasText: YOAV.name })
    .first()
    .getByRole('link')
    .click();
  await expect(admin.getByText('It carries no messages.', { exact: false })).toBeVisible();
  await admin.getByLabel('Suspend the reported person from sending in chat').check();
  await admin.getByLabel('For how many days').fill('1');
  await admin.getByLabel('Reason', { exact: true }).fill('A day to cool down (test).');
  await admin.getByRole('button', { name: 'Decide' }).click();
  await expect(admin.getByText('This person is suspended from chat now.')).toBeVisible();
  await expect(
    yoav.getByText('suspended you from sending messages', { exact: false }),
  ).toBeVisible();
  await expect(yoav.getByLabel('Message', { exact: true })).toHaveCount(0);

  // Lifting it gives the composer back.
  await admin.goto('/en/admin/chat/reports');
  await admin
    .getByRole('button', { name: `Lift the suspension of ${YOAV.name}` })
    .first()
    .click();
  await admin.getByLabel('Reason for lifting').fill('End of the test.');
  await admin.getByRole('button', { name: 'Lift', exact: true }).click();
  await expect(admin.getByTestId('chat-suspensions-table')).toContainText('Lifted');
  await expect(yoav.getByLabel('Message', { exact: true })).toBeVisible();
  await send(yoav, 'Message', `Back again ${tag}`);
});

test('the chat fits a phone: the list and the conversation are a screen each', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  await signIn(page, 'he', NOA.email, DEMO_PASSWORD);
  await expectSignedIn(page, NOA.email);
  await page.goto('/he/chat');
  const list = page.getByTestId('conversation-list');
  await expect(list).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);

  await list.getByRole('link', { name: RUTH.name }).click();
  await expect(page.getByTestId('chat-with')).toHaveText(RUTH.name);
  await expect(list).toBeHidden();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);

  // By keyboard alone: the message box is reached, and Enter sends.
  const text = `מהטלפון ${Date.now().toString().slice(-6)}`;
  await page.getByLabel('הודעה', { exact: true }).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(messageWith(page, text)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.getByRole('link', { name: 'כל השיחות' }).click();
  await expect(list).toBeVisible();
  await expect(page.getByTestId('chat-with')).toHaveCount(0);
});
