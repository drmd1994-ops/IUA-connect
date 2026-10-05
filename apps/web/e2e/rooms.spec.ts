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
 * M12 exit tests (docs/plans/M12-chat-rooms.md §7): a member browses the rooms, joins one and
 * leaves it; people in a room see each other's messages, reactions and mentions arrive without
 * refreshing; a moderator announces, pins, removes a message, locks the room and bans a person;
 * staff open a room, appoint a moderator, archive it, keep the categories and decide on a
 * report about a room; the phone layout. Plus axe on every room page. The demo rooms come from
 * the seed and are fictional; the tests leave them as they found them (nobody banned, nothing
 * pinned or locked, the same people in each room).
 */
const DEMO_PASSWORD = 'olive-grove-demo-2026';
const NOA = { email: 'member.full@demo.test', name: 'Noa Bar-Lev' };
const RUTH = { email: 'member.honorary@demo.test', name: 'Ruth Golan' };
const YOAV = { email: 'member.resident@demo.test', name: 'Yoav Sela' };
const OPEN_MENU = 'Actions for this message';

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

/** Opens one of the reader's rooms from the list of rooms. */
async function openRoom(page: Page, locale: 'he' | 'en', name: string) {
  await page.goto(`/${locale}/chat/rooms`);
  await page.getByTestId('room-list').getByRole('link', { name }).click();
  await expect(page.getByTestId('room-name')).toHaveText(name);
  await expect(page.getByTestId('message-log')).toBeVisible();
}

const log = (page: Page) => page.getByTestId('message-log');
const messageWith = (page: Page, text: string) =>
  log(page).getByTestId('message').filter({ hasText: text });

async function send(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(messageWith(page, text)).toBeVisible();
}

async function menu(page: Page, message: Locator, action: string) {
  await message.getByRole('button', { name: OPEN_MENU }).click();
  await page.getByTestId('message-menu').getByRole('button', { name: action, exact: true }).click();
}

const details = async (page: Page) => {
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  return page.getByRole('dialog');
};

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.setTimeout(180_000);

test('a member joins a room; messages, reactions and mentions arrive without refreshing', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const noa = await memberPage(browser, 'en', NOA.email);
  const yoav = await memberPage(browser, 'en', YOAV.email);

  // The Rooms side of the chat, and every open room.
  await noa.goto('/en/chat');
  await noa.getByRole('link', { name: 'Rooms', exact: true }).click();
  await expect(noa.getByTestId('room-list')).toContainText('General');
  // An earlier run that stopped half-way may have left her in the room.
  const stale = noa.getByTestId('room-list').getByRole('link', { name: 'Residents' });
  if ((await stale.count()) > 0) {
    await stale.click();
    await (await details(noa)).getByRole('button', { name: 'Leave the room' }).click();
    await noa.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(noa).toHaveURL(/\/en\/chat\/rooms$/);
  }
  await expect(noa.getByTestId('room-list')).not.toContainText('Residents');
  await expectAccessible(noa);
  await noa.getByRole('link', { name: 'Browse rooms' }).click();
  const card = noa.getByTestId('room-card').filter({ hasText: 'Residents' });
  await expect(card).toBeVisible();
  await expectAccessible(noa);

  // Joining says that the people in the room will see her name.
  await card.getByRole('button', { name: 'Join Residents' }).click();
  const join = noa.getByRole('dialog');
  await expect(join).toContainText('will see your first and last name');
  await expectAccessible(noa);
  await join.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(noa.getByTestId('room-name')).toHaveText('Residents');
  await expect(noa.getByTestId('room-members')).toContainText('2 members');
  await expectAccessible(noa);

  // Yoav is in the room: Noa's message arrives on his open page, under her name.
  await openRoom(yoav, 'en', 'Residents');
  const hello = `Hello residents, a test message ${tag}`;
  await send(noa, hello);
  await expect(messageWith(yoav, hello)).toBeVisible({ timeout: 2_000 });
  await expect(messageWith(yoav, hello).getByTestId('sender')).toHaveText(NOA.name);

  // Yoav reacts; Noa sees the reaction, and takes her own on and off.
  await messageWith(yoav, hello).getByRole('button', { name: OPEN_MENU }).click();
  await yoav.getByTestId('message-menu').getByRole('button', { name: 'Thumbs up' }).click();
  const chip = messageWith(noa, hello).getByTestId('reactions').getByRole('button');
  await expect(chip).toHaveAccessibleName('Thumbs up: 1');
  await chip.click();
  await expect(chip).toHaveAccessibleName('Thumbs up: 2, including yours');
  await chip.click();
  await expect(chip).toHaveAccessibleName('Thumbs up: 1');

  // A mention: "@" and the start of a name offers the people in the room.
  const box = noa.getByLabel('Message', { exact: true });
  await box.pressSequentially('@Yoa');
  await noa
    .getByTestId('mention-suggestions')
    .getByRole('button', { name: `Mention ${YOAV.name}` })
    .click();
  await box.pressSequentially(`see the rota ${tag}`);
  await box.press('Enter');
  const mention = messageWith(yoav, `see the rota ${tag}`);
  await expect(mention.getByTestId('mention')).toHaveText(`@${YOAV.name}`);
  await yoav.goto('/en/account/notifications');
  await expect(yoav.getByText('mentioned you', { exact: false }).first()).toBeVisible();

  // Leaving: the room is gone from her list, and can be joined again.
  const about = await details(noa);
  await expect(about.getByTestId('room-people')).toContainText(YOAV.name);
  await expectAccessible(noa);
  await about.getByRole('button', { name: 'Leave the room' }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(noa).toHaveURL(/\/en\/chat\/rooms$/);
  await expect(noa.getByTestId('room-list')).not.toContainText('Residents');
});

test('a moderator announces, pins, removes a message, locks the room and bans a person', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const noa = await memberPage(browser, 'en', NOA.email);
  const yoav = await memberPage(browser, 'en', YOAV.email);
  const ruth = await memberPage(browser, 'en', RUTH.email);
  await openRoom(noa, 'en', 'General');
  await openRoom(yoav, 'en', 'General');
  await openRoom(ruth, 'en', 'General');

  // An announcement stands out for everyone, and is pinned to the top of the room.
  const notice = `The hall changed, a test announcement ${tag}`;
  await noa.getByLabel('Send as an announcement', { exact: false }).check();
  await send(noa, notice);
  await expect(messageWith(yoav, notice)).toHaveAttribute('data-announcement', 'true');
  await menu(noa, messageWith(noa, notice), 'Pin');
  await expect(yoav.getByTestId('pins-summary')).toHaveText('Pinned messages (1)');
  await yoav.getByTestId('pins-summary').click();
  await expect(yoav.getByTestId('pins')).toContainText(notice);
  await expectAccessible(yoav);
  await menu(noa, messageWith(noa, notice), 'Unpin');
  await expect(yoav.getByTestId('pins-summary')).toHaveCount(0);

  // A member has no moderator's tools.
  await messageWith(yoav, notice).getByRole('button', { name: OPEN_MENU }).click();
  await expect(yoav.getByTestId('message-menu').getByRole('button', { name: 'Pin' })).toHaveCount(
    0,
  );
  await yoav.keyboard.press('Escape');

  // The moderator removes a member's message: everyone sees that, and its text is gone.
  const unwanted = `An unwanted test message ${tag}`;
  await send(yoav, unwanted);
  await menu(noa, messageWith(noa, unwanted), 'Remove (moderator)');
  await noa.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(log(yoav).getByText(unwanted)).toHaveCount(0);
  await expect(log(yoav).getByText('Removed by a moderator').last()).toBeVisible();

  // Locking: members read and can't write; the moderator still can. Then unlocked.
  let about = await details(noa);
  await expect(about.getByTestId('room-moderation')).toBeVisible();
  await expectAccessible(noa);
  await about.getByRole('button', { name: 'Lock the room' }).click();
  await expect(yoav.getByText('A moderator locked this room.', { exact: false })).toBeVisible();
  await expect(yoav.getByLabel('Message', { exact: true })).toHaveCount(0);
  await about.getByRole('button', { name: 'Unlock the room' }).click();
  await expect(yoav.getByLabel('Message', { exact: true })).toBeVisible();
  await about.getByRole('button', { name: 'Close' }).first().click();

  // A ban: Ruth is out of the room at once and can't join it.
  const fromRuth = `A test message from Ruth ${tag}`;
  await send(ruth, fromRuth);
  await menu(noa, messageWith(noa, fromRuth), 'Ban the writer from the room');
  const ban = noa.getByRole('dialog');
  await expect(ban.getByRole('heading', { name: `Ban ${RUTH.name} from the room` })).toBeVisible();
  await expectAccessible(noa);
  await ban.getByLabel('For how many days').fill('1');
  await ban.getByLabel('Reason', { exact: true }).fill('A test ban.');
  await ban.getByRole('button', { name: 'Ban', exact: true }).click();
  await expect(ruth.getByTestId('room-join')).toContainText('can’t join it now');
  await expect(ruth.getByTestId('message-log')).toHaveCount(0);
  await ruth.goto('/en/chat/rooms');
  await expect(ruth.getByRole('heading', { name: 'Rooms', exact: true })).toBeVisible();
  await expect(ruth.getByRole('link', { name: 'General' })).toHaveCount(0);

  // Lifted: she joins again.
  about = await details(noa);
  await about.getByRole('button', { name: `Lift the ban of ${RUTH.name}` }).click();
  await expect(about.getByText('Nobody is banned.')).toBeVisible();
  await about.getByRole('button', { name: 'Close' }).first().click();
  await ruth.goto('/en/chat/rooms/browse');
  await ruth
    .getByTestId('room-card')
    .filter({ hasText: 'Open conversation between the members' })
    .getByRole('button', { name: 'Join General' })
    .click();
  await ruth.getByRole('dialog').getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ruth.getByTestId('room-name')).toHaveText('General');
  await expect(messageWith(ruth, fromRuth)).toBeVisible();
});

test('staff open a room, appoint a moderator, keep the categories and decide on a room report', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const admin = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(admin);
  const adminEmail = uniqueEmail('m12-rooms');
  await signIn(admin, 'en', adminEmail, createAdmin(adminEmail));
  await expect(admin).toHaveURL(/\/en\/account\/security$/);
  await admin.getByLabel('Passkey name').fill('Laptop');
  await admin.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(admin.getByText('Passkey added.')).toBeVisible();

  // The rooms, and a new one.
  await admin.goto('/en/admin/chat/rooms');
  await expect(admin.getByRole('heading', { name: 'Chat rooms' })).toBeVisible();
  await expect(admin.getByTestId('admin-rooms-table')).toContainText('Announcements');
  await expectAccessible(admin);
  await admin.getByRole('link', { name: 'Open a room' }).click();
  const roomName = `Test room ${tag}`;
  await admin.getByLabel('Name in Hebrew').fill(`חדר בדיקה ${tag}`);
  await admin.getByLabel('Name in English (optional)').fill(roomName);
  await admin
    .getByLabel('Description in English (optional)')
    .fill('A room made by a test. Everything in it is fictional.');
  await admin.getByLabel('Category').selectOption({ label: 'General' });
  await expectAccessible(admin);
  await admin.getByRole('button', { name: 'Open the room' }).click();
  await expect(admin).toHaveURL(/\/en\/admin\/chat\/rooms\/[0-9a-f-]{36}$/);
  await expect(admin.getByText('This room has no moderator yet.')).toBeVisible();

  // A moderator is an active member, found by name.
  await admin.getByLabel('Find a member by name or email').fill('Bar-Lev');
  await admin
    .getByRole('region', { name: 'Moderators' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await admin.getByRole('button', { name: `Appoint ${NOA.name} as a moderator` }).click();
  await expect(admin.getByTestId('admin-room-moderators')).toContainText(NOA.name);
  await expectAccessible(admin);

  // A member finds the new room, joins it and reports it.
  const yoav = await memberPage(browser, 'en', YOAV.email);
  await yoav.goto('/en/chat/rooms/browse');
  await yoav.getByLabel('Search by name').fill(roomName);
  await yoav
    .getByTestId('browse-rooms')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await yoav.getByRole('button', { name: `Join ${roomName}` }).click();
  await yoav.getByRole('dialog').getByRole('button', { name: 'Join', exact: true }).click();
  await expect(yoav.getByTestId('room-name')).toHaveText(roomName);
  const about = await details(yoav);
  await about.getByRole('button', { name: 'Report this room' }).click();
  const report = yoav.getByRole('dialog');
  await expect(report.getByRole('heading', { name: `Report the room ${roomName}` })).toBeVisible();
  await expectAccessible(yoav);
  await report.getByLabel('Reason').selectOption({ label: 'Spam or advertising' });
  await report.getByLabel('What happened (optional)').fill(`Test report about a room ${tag}`);
  await report.getByRole('button', { name: 'Send the report' }).click();
  await expect(report.getByText('Your report was sent', { exact: false })).toBeVisible();

  // Staff read a room without joining it, and don't write in it.
  await admin.getByRole('link', { name: 'Open the room in chat' }).click();
  await expect(admin.getByTestId('room-name')).toHaveText(roomName);
  await expect(admin.getByTestId('message-log')).toBeVisible();
  await expect(admin.getByText('Join this room to write in it.')).toBeVisible();
  await expect(admin.getByLabel('Message', { exact: true })).toHaveCount(0);

  // The report names the room; staff archive the room from it, and the member sees that.
  await admin.goto('/en/admin/chat/reports');
  await admin
    .getByTestId('chat-reports-table')
    .getByRole('row')
    .filter({ hasText: 'A room' })
    .getByRole('link', { name: roomName })
    .click();
  await expect(admin.getByTestId('chat-report')).toContainText(roomName);
  await expect(
    admin.getByText('This report is about the room as such.', { exact: false }),
  ).toBeVisible();
  await expectAccessible(admin);
  await admin.getByLabel('Archive the room').check();
  await admin.getByLabel('Reason', { exact: true }).fill('End of the test.');
  await admin.getByRole('button', { name: 'Decide' }).click();
  await expect(admin.getByTestId('chat-report')).toContainText('Upheld');
  await yoav.reload();
  await expect(yoav.getByText('This room is archived.', { exact: false })).toBeVisible();
  await admin.goto('/en/admin/chat/rooms');
  await expect(admin.getByTestId('admin-rooms-table')).not.toContainText(roomName);
  await admin.getByLabel('Show').selectOption('archived');
  await expect(admin.getByTestId('admin-rooms-table')).toContainText(roomName);

  // Categories and report reasons.
  await admin.getByRole('link', { name: 'Categories and report reasons' }).click();
  const categories = admin.getByRole('region', { name: 'Room categories' });
  await expect(admin.getByTestId('admin-chat-rooms')).toContainText('CONFERENCES');
  await expect(admin.getByTestId('admin-chat-reasons')).toContainText('SPAM');
  await expectAccessible(admin);
  const key = `TEST_${tag}`;
  await categories.getByLabel('Key').fill(key);
  await categories.getByLabel('Name in Hebrew').last().fill(`קטגוריית בדיקה ${tag}`);
  await categories.getByLabel('Name in English').last().fill(`Test category ${tag}`);
  await categories.getByRole('button', { name: 'Add a category' }).click();
  await expect(admin.getByTestId('admin-chat-rooms')).toContainText(key);
  // A category no room uses can be deleted.
  await categories.getByRole('button', { name: `Delete ${key}` }).click();
  await expect(admin.getByTestId('admin-chat-rooms')).not.toContainText(key);
});

test('the rooms fit a phone, in Hebrew', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  await signIn(page, 'he', NOA.email, DEMO_PASSWORD);
  await expectSignedIn(page, NOA.email);
  await page.goto('/he/chat/rooms');
  const list = page.getByTestId('room-list');
  await expect(list).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);

  await list.getByRole('link', { name: 'הודעות האיגוד' }).click();
  await expect(page.getByTestId('room-name')).toHaveText('הודעות האיגוד');
  await expect(list).toBeHidden();
  await expect(page.getByTestId('pins-summary')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);

  await page.getByRole('link', { name: 'כל החדרים שלי' }).click();
  await expect(list).toBeVisible();

  await page.goto('/he/chat/rooms/browse');
  await expect(page.getByTestId('browse-rooms')).toBeVisible();
  await expect(page.getByTestId('room-card').first()).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);
});
