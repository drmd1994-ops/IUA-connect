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
 * M13 exit tests (docs/plans/M13-chat-groups-status.md §6): a member makes a group and invites
 * two people, one accepts and one declines, and nobody is in it before accepting; files in a
 * message, forwarding, pinning and opening a found message in its place; who is active, and the
 * switch that hides it; a room by invitation that an uninvited member can't find; the phone
 * layout. Plus axe on every new page and dialog. The demo people and the demo group come from
 * the seed and are fictional; the tests leave them as they found them.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const NOA = { email: 'member.full@demo.test', name: 'Noa Bar-Lev' };
const RUTH = { email: 'member.honorary@demo.test', name: 'Ruth Golan' };
const YOAV = { email: 'member.resident@demo.test', name: 'Yoav Sela' };
const READING_GROUP = 'קבוצת קריאה / Reading group';
const OPEN_MENU = 'Actions for this message';
/** A one-pixel PNG picture. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

async function openGroup(page: Page, name: string) {
  await page.goto('/en/chat');
  await page.getByTestId('conversation-list').getByRole('link', { name }).click();
  await expect(page.getByTestId('group-name')).toHaveText(name);
  await expect(log(page)).toBeVisible();
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.setTimeout(180_000);

// A person may hold three live chat connections. Windows left open by an earlier test would
// take them, and the next test's page would keep losing its own.
test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test('a member makes a group; nobody is in it before accepting an invitation', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const name = `Test group ${tag}`;
  const noa = await memberPage(browser, 'en', NOA.email);
  const ruth = await memberPage(browser, 'en', RUTH.email);
  const yoav = await memberPage(browser, 'en', YOAV.email);

  // Noa makes the group and invites two people.
  await noa.goto('/en/chat');
  await noa.getByRole('button', { name: 'New group' }).click();
  const create = noa.getByRole('dialog');
  await create.getByLabel('Name of the group').fill(name);
  for (const [family, person] of [
    ['Golan', RUTH.name],
    ['Sela', YOAV.name],
  ] as const) {
    await create.getByLabel('Find people to invite').fill(family);
    await create.getByRole('button', { name: 'Search', exact: true }).click();
    await create.getByRole('button', { name: `Invite ${person}` }).click();
  }
  await expect(create.getByTestId('group-chosen')).toContainText(RUTH.name);
  await expect(create.getByTestId('group-chosen')).toContainText(YOAV.name);
  await expect(create).toContainText('joins only if they accept');
  await expectAccessible(noa);
  await create.getByRole('button', { name: 'Make the group' }).click();
  await expect(noa.getByTestId('group-name')).toHaveText(name);
  await expect(noa.getByTestId('group-people')).toHaveText('1 person');
  await expectAccessible(noa);
  const address = new URL(noa.url()).pathname;
  await send(noa, `Written before anyone came ${tag}`);

  // Ruth is told, and sees who invited her and who is in the group, and nothing written there.
  await ruth.goto('/en/chat');
  await ruth.getByTestId('invitations-link').click();
  const invitation = ruth.getByTestId('invitation').filter({ hasText: name });
  await expect(invitation).toContainText(`${NOA.name} invited you`);
  await expect(invitation).toContainText('In the group:');
  await expect(ruth.getByTestId('invitations')).not.toContainText('Written before anyone came');
  await expectAccessible(ruth);
  // The group's address shows her nothing before she accepts.
  const peek = await (await browser.newContext()).newPage();
  await signIn(peek, 'en', RUTH.email, DEMO_PASSWORD);
  await expectSignedIn(peek, RUTH.email);
  await peek.goto(address);
  await expect(peek.getByText('The page or item you requested was not found.')).toBeVisible();
  await expect(peek.getByTestId('message-log')).toHaveCount(0);
  await peek.context().close();

  // She accepts: now she is in, and a message arrives on her open page.
  await ruth.getByRole('button', { name: `Accept the invitation to ${name}` }).click();
  await expect(ruth.getByTestId('group-name')).toHaveText(name);
  await expect(messageWith(ruth, `Written before anyone came ${tag}`)).toBeVisible();
  const hello = `Welcome to the group ${tag}`;
  await send(noa, hello);
  await expect(messageWith(ruth, hello)).toBeVisible({ timeout: 2_000 });
  await expect(messageWith(ruth, hello).getByTestId('sender')).toHaveText(NOA.name);
  await expect(noa.getByTestId('group-people')).toHaveText('2 people');

  // Yoav declines: the group stays closed to him.
  await yoav.goto('/en/chat/invitations');
  await yoav.getByRole('button', { name: `Decline the invitation to ${name}` }).click();
  await expect(yoav.getByTestId('invitation').filter({ hasText: name })).toHaveCount(0);
  await yoav.goto(address);
  await expect(yoav.getByText('The page or item you requested was not found.')).toBeVisible();

  // What the admin can do: the people, nobody waiting any more, and removing a person.
  const about = await details(noa);
  await expect(about.getByTestId('group-members')).toContainText(RUTH.name);
  await expect(about.getByText('Nobody is waiting.')).toBeVisible();
  await expect(about).toContainText('staff can’t read a group');
  await expectAccessible(noa);
  await about.getByRole('button', { name: `Remove ${RUTH.name} from the group` }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(ruth.getByTestId('group-left')).toContainText('You are no longer in this group.');
  await expect(ruth.getByTestId('message-log')).toHaveCount(0);

  // The last person leaves: the group is closed.
  await noa.getByRole('dialog').getByRole('button', { name: 'Leave the group' }).click();
  await noa.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(noa).toHaveURL(/\/en\/chat$/);
  await expect(noa.getByTestId('conversation-list')).not.toContainText(name);
});

test('files in a message, forwarding, pinning, and opening a found message in its place', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const noa = await memberPage(browser, 'en', NOA.email);
  const ruth = await memberPage(browser, 'en', RUTH.email);

  // The demo group is pinned to the top of Noa's list, and holds a picture and a document.
  await noa.goto('/en/chat');
  const first = noa.getByTestId('conversation-list').getByRole('link').first();
  await expect(first).toContainText(READING_GROUP);
  await expect(first).toContainText('Pinned');
  await openGroup(noa, READING_GROUP);
  await openGroup(ruth, READING_GROUP);
  const seeded = messageWith(noa, 'Here is the timetable');
  await expect(
    seeded.getByRole('button', { name: 'Open the picture attendance-chart.png' }),
  ).toBeVisible();
  await expect(
    seeded.getByRole('link', { name: 'Download reading-group-timetable.pdf' }),
  ).toBeVisible();
  await expectAccessible(noa);
  await seeded.getByRole('button', { name: 'Open the picture attendance-chart.png' }).click();
  await expect(
    noa.getByRole('dialog').getByRole('img', { name: 'Picture: attendance-chart.png' }),
  ).toBeVisible();
  await expectAccessible(noa);
  await noa.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // A file of a type that can't be sent is refused in words.
  const attach = noa.getByLabel('Attach a file');
  await attach.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await expect(noa.getByText('This type of file can’t be sent.', { exact: false })).toBeVisible();

  // A picture is attached and sent; it arrives on Ruth's open page.
  await attach.setInputFiles({ name: `pixel-${tag}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(noa.getByTestId('chosen-files')).toContainText(`pixel-${tag}.png`);
  const withPicture = `With a picture ${tag}`;
  await send(noa, withPicture);
  await expect(noa.getByTestId('chosen-files')).toHaveCount(0);
  await expect(
    messageWith(ruth, withPicture).getByRole('button', {
      name: `Open the picture pixel-${tag}.png`,
    }),
  ).toBeVisible();

  // Forwarded to a private conversation: a copy, marked, with its picture.
  await menu(noa, messageWith(noa, withPicture), 'Forward');
  const forward = noa.getByRole('dialog');
  await expect(forward).toContainText('doesn’t say who wrote it');
  await expectAccessible(noa);
  await forward.getByRole('button', { name: `Forward to ${RUTH.name}` }).click();
  await expect(forward.getByText(`Forwarded to ${RUTH.name}.`)).toBeVisible();
  await forward.getByRole('button', { name: 'Close', exact: true }).click();
  await ruth.goto('/en/chat');
  await ruth.getByTestId('conversation-list').getByRole('link', { name: NOA.name }).first().click();
  const copy = messageWith(ruth, withPicture);
  await expect(copy.getByTestId('forwarded')).toHaveText('Forwarded');
  await expect(
    copy.getByRole('button', { name: `Open the picture pixel-${tag}.png` }),
  ).toBeVisible();

  // Finding a message and opening it in its place.
  const about = await details(noa);
  await about.getByRole('button', { name: 'Search in this group' }).click();
  const search = noa.getByRole('dialog');
  await search.getByLabel('Words to find').fill('timetable');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByTestId('chat-search-results')).toContainText('Here is the timetable');
  await expectAccessible(noa);
  await search.getByRole('link', { name: 'Go to this message' }).first().click();
  await expect(noa).toHaveURL(/\/chat\/groups\/[0-9a-f-]{36}\?at=3$/);
  await expect(log(noa).locator('[data-seq="3"]')).toContainText('Here is the timetable');
  await noa.getByTestId('newest-link').click();
  await expect(noa).toHaveURL(/\/chat\/groups\/[0-9a-f-]{36}$/);
  await expect(noa.getByTestId('newest-link')).toHaveCount(0);

  // The pin comes down and goes back up.
  let own = await details(noa);
  await own.getByRole('button', { name: 'Take down from the top of my list' }).click();
  await expect(own.getByRole('button', { name: 'Pin to the top of my list' })).toBeVisible();
  await own.getByRole('button', { name: 'Pin to the top of my list' }).click();
  await expect(
    own.getByRole('button', { name: 'Take down from the top of my list' }),
  ).toBeVisible();
  await own.getByRole('button', { name: 'Close' }).first().click();

  // Deleting both messages for everyone takes the picture away from everyone.
  await menu(noa, messageWith(noa, withPicture), 'Delete for everyone');
  await noa.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(log(noa).getByText(withPicture)).toHaveCount(0);
  await noa.goto('/en/chat');
  await noa.getByTestId('conversation-list').getByRole('link', { name: RUTH.name }).first().click();
  await menu(noa, messageWith(noa, withPicture), 'Delete for everyone');
  await noa.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(log(ruth).getByText(withPicture)).toHaveCount(0);
  own = noa.getByRole('dialog');
  await expect(own).toHaveCount(0);
});

test('who is active is shown to the people a person talks with, until they switch it off', async ({
  browser,
}) => {
  const noa = await memberPage(browser, 'en', NOA.email);
  const ruth = await memberPage(browser, 'en', RUTH.email);
  await ruth.goto('/en/chat');
  await expect(ruth.getByTestId('conversation-list')).toBeVisible();

  const openRuth = async () => {
    await noa.goto('/en/chat');
    await noa
      .getByTestId('conversation-list')
      .getByRole('link', { name: RUTH.name })
      .first()
      .click();
    await expect(noa.getByTestId('chat-with')).toHaveText(RUTH.name);
  };
  await openRuth();
  const mark = noa.locator('header').getByTestId('activity');
  await expect(mark).toHaveAttribute('data-activity', 'online');
  await expect(mark).toHaveText('Active now');
  await expectAccessible(noa);

  // Ruth switches it off: Noa is told nothing about her, online or not.
  await ruth.goto('/en/account/chat');
  const show = ruth.getByLabel('Show the people I talk with when I am active');
  await expect(show).toBeChecked();
  await expect(ruth.getByText('Who can invite me to groups', { exact: false })).toBeVisible();
  await expectAccessible(ruth);
  await show.uncheck();
  await ruth.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ruth.getByText('Saved.')).toBeVisible();
  await ruth.goto('/en/chat');
  await expect(ruth.getByTestId('conversation-list')).toBeVisible();
  await openRuth();
  await expect(noa.getByTestId('message-log')).toBeVisible();
  await expect(noa.locator('header').getByTestId('activity')).toHaveCount(0);

  // Back on, as it was.
  await ruth.goto('/en/account/chat');
  await ruth.getByLabel('Show the people I talk with when I am active').check();
  await ruth.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ruth.getByText('Saved.')).toBeVisible();
});

test('a room by invitation: not found by a member until a moderator invites them', async ({
  browser,
}) => {
  const tag = Date.now().toString().slice(-6);
  const roomName = `Closed room ${tag}`;
  const admin = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(admin);
  const adminEmail = uniqueEmail('m13-rooms');
  await signIn(admin, 'en', adminEmail, createAdmin(adminEmail));
  await expect(admin).toHaveURL(/\/en\/account\/security$/);
  await admin.getByLabel('Passkey name').fill('Laptop');
  await admin.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(admin.getByText('Passkey added.')).toBeVisible();

  // Staff open a room by invitation and appoint a moderator.
  await admin.goto('/en/admin/chat/rooms/new');
  await admin.getByLabel('Name in Hebrew').fill(`חדר סגור ${tag}`);
  await admin.getByLabel('Name in English (optional)').fill(roomName);
  await admin.getByLabel('By invitation only', { exact: false }).check();
  await expectAccessible(admin);
  await admin.getByRole('button', { name: 'Open the room' }).click();
  await expect(admin).toHaveURL(/\/en\/admin\/chat\/rooms\/[0-9a-f-]{36}$/);
  const roomId = new URL(admin.url()).pathname.split('/').at(-1)!;
  await admin.getByLabel('Find a member by name or email').fill('Bar-Lev');
  await admin
    .getByRole('region', { name: 'Moderators' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await admin.getByRole('button', { name: `Appoint ${NOA.name} as a moderator` }).click();
  await expect(admin.getByTestId('admin-room-moderators')).toContainText(NOA.name);

  // A member can't find it, and its address shows nothing.
  const yoav = await memberPage(browser, 'en', YOAV.email);
  await yoav.goto('/en/chat/rooms/browse');
  await yoav.getByLabel('Search by name').fill(roomName);
  await yoav
    .getByTestId('browse-rooms')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await expect(yoav.getByText('No room matches.')).toBeVisible();
  await yoav.goto(`/en/chat/rooms/${roomId}`);
  await expect(yoav.getByText('The page or item you requested was not found.')).toBeVisible();

  // The moderator invites him from the room.
  const noa = await memberPage(browser, 'en', NOA.email);
  await noa.goto(`/en/chat/rooms/${roomId}`);
  await expect(noa.getByTestId('room-name')).toHaveText(roomName);
  await expect(noa.getByTestId('room-members')).toContainText('By invitation');
  const about = await details(noa);
  const panel = about.getByTestId('invite-panel');
  await panel.getByLabel('Invite members to this room').fill('Sela');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByRole('button', { name: `Invite ${YOAV.name}` }).click();
  await expect(panel.getByTestId('waiting-invitations')).toContainText(YOAV.name);
  await expectAccessible(noa);

  // Still nothing at the room's address; the invitation says what accepting shows of him.
  await yoav.goto(`/en/chat/rooms/${roomId}`);
  await expect(yoav.getByText('The page or item you requested was not found.')).toBeVisible();
  await yoav.goto('/en/chat/invitations');
  const invitation = yoav.getByTestId('invitation').filter({ hasText: roomName });
  await expect(invitation).toContainText('Room by invitation');
  await expect(invitation).toContainText('see your first and last name');
  await yoav.getByRole('button', { name: `Accept the invitation to ${roomName}` }).click();
  await expect(yoav.getByTestId('room-name')).toHaveText(roomName);
  await expect(yoav.getByTestId('message-log')).toBeVisible();

  // Tidied away: staff archive the test room.
  await admin.reload();
  await admin.getByRole('button', { name: 'Archive the room' }).click();
  await expect(admin.getByRole('button', { name: 'Restore the room' })).toBeVisible();
});

test('invitations and a group fit a phone, in Hebrew', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  await signIn(page, 'he', NOA.email, DEMO_PASSWORD);
  await expectSignedIn(page, NOA.email);
  await page.goto('/he/chat/invitations');
  await expect(page.getByTestId('invitations')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'הזמנות' })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);

  await page.goto('/he/chat');
  const list = page.getByTestId('conversation-list');
  await list.getByRole('link', { name: READING_GROUP }).click();
  await expect(page.getByTestId('group-name')).toHaveText(READING_GROUP);
  await expect(list).toBeHidden();
  await expect(page.getByTestId('attachments').first()).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await expectAccessible(page);
  await page.getByRole('link', { name: 'כל השיחות' }).click();
  await expect(list).toBeVisible();
});
