import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  addVirtualAuthenticator,
  createAdmin,
  expectSignedIn,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * The accessibility audit of M9 (docs/plans/M9-pitch-readiness.md §2.3), kept as tests so it
 * keeps running: axe (WCAG 2.2 AA) on the signed-in pages that accessibility.spec.ts can only
 * see signed out; a keyboard-only pass (everything reachable, focus always visible, no trap);
 * and reflow at 320 px (no sideways scrolling, as at 400% zoom).
 * Automated checks find a part of the problems; the screen-reader pass is done by a person
 * (docs/demo/NVDA_CHECKLIST.md).
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const MEMBER = 'member.full@demo.test';

async function violations(page: Page): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function newPage(browser: Browser, passkey = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (passkey) await addVirtualAuthenticator(page);
  return page;
}

test.setTimeout(420_000);

const MEMBER_PAGES = [
  '',
  '/account/profile',
  '/account/verification',
  '/organisations/demo-urological-society',
  '/organisations/demo-urological-society/membership',
  '/organisations/demo-urological-society/membership/card',
  '/account/schedule',
  '/account/exam-results',
  '/account/notifications',
  '/account/notifications/preferences',
  '/account/security',
  // The chat pages themselves keep a connection open, so they never go quiet; chat.spec.ts
  // and rooms.spec.ts run axe on them.
  '/account/chat',
  '/members',
  '/education/exam',
  '/search?q=demo',
];

test('axe: every page a signed-in member sees, in both languages', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, 'en', MEMBER, DEMO_PASSWORD);
  await expectSignedIn(page, MEMBER);
  const found: Record<string, string[]> = {};
  for (const locale of ['he', 'en']) {
    for (const path of MEMBER_PAGES) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      const problems = await violations(page);
      if (problems.length > 0) found[`/${locale}${path}`] = problems;
    }
  }
  expect(found).toEqual({});
});

/** Admin pages, and for the lists: the first item's own page. */
const ADMIN_PAGES: { path: string; openFirst?: string }[] = [
  { path: '/admin' },
  { path: '/admin/applications' },
  { path: '/admin/members', openFirst: 'members-table' },
  { path: '/admin/institutions' },
  { path: '/admin/import' },
  { path: '/admin/news', openFirst: 'news-table' },
  { path: '/admin/news/new' },
  { path: '/admin/news/categories' },
  { path: '/admin/guidelines' },
  { path: '/admin/events', openFirst: 'events-table' },
  { path: '/admin/events/new' },
  { path: '/admin/events/speakers' },
  { path: '/admin/events/categories' },
  { path: '/admin/education', openFirst: 'education-table' },
  { path: '/admin/education/new' },
  { path: '/admin/education/questions', openFirst: 'questions-table' },
  { path: '/admin/education/questions/new' },
  { path: '/admin/broadcasts', openFirst: 'broadcasts-table' },
  { path: '/admin/broadcasts/new' },
  { path: '/admin/chat/reports', openFirst: 'chat-reports-table' },
  { path: '/admin/chat/rooms', openFirst: 'admin-rooms-table' },
  { path: '/admin/chat/rooms/new' },
  { path: '/admin/chat/rooms/settings' },
  { path: '/admin/users', openFirst: 'accounts-table' },
  { path: '/admin/users/roles' },
  { path: '/admin/audit' },
  { path: '/admin/demo-outbox' },
  { path: '/admin/settings' },
];

test('axe: every admin page, signed in, in both languages', async ({ browser }) => {
  const page = await newPage(browser, true);
  const email = uniqueEmail('m9-audit');
  await signIn(page, 'en', email, createAdmin(email));
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();

  const found: Record<string, string[]> = {};
  for (const locale of ['he', 'en']) {
    for (const { path, openFirst } of ADMIN_PAGES) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      const problems = await violations(page);
      if (problems.length > 0) found[`/${locale}${path}`] = problems;
      // The item pages are checked once, in Hebrew.
      if (!openFirst || locale !== 'he') continue;
      const first = page.getByTestId(openFirst).getByRole('link').first();
      if ((await first.count()) === 0) continue;
      await first.click();
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('main h1').first()).toBeVisible();
      const inner = await violations(page);
      if (inner.length > 0) found[`/${locale}${path} → first item`] = inner;
    }
  }
  expect(found).toEqual({});

  // The same pages at 320 px: the page itself never scrolls sideways (wide tables scroll
  // inside their own frame).
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow: Record<string, string> = {};
  for (const { path } of ADMIN_PAGES) {
    await page.goto(`/he${path}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { content, width } = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    if (content > width + 1) overflow[path] = `${content}px of content in ${width}px`;
  }
  expect(overflow).toEqual({});
});

/**
 * Tabs through the whole page. Returns what could not be reached, and what was focused without
 * a visible focus indicator.
 */
async function keyboardPass(page: Page): Promise<{ unreachable: string[]; unmarked: string[] }> {
  await page.waitForLoadState('networkidle');
  const total = await page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
      'select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      // Inside a disabled fieldset nothing takes focus.
      if (el.closest('fieldset[disabled]')) return false;
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0
      );
    };
    const elements = [...document.querySelectorAll(selector)].filter(visible);
    elements.forEach((el, index) => el.setAttribute('data-kb', String(index)));
    return elements.length;
  });

  const reached = new Set<string>();
  const unmarked: string[] = [];
  await page
    .locator('body')
    .click({ position: { x: 1, y: 1 } })
    .catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < total + 10; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const label = (
        el.getAttribute('aria-label') ??
        el.textContent ??
        el.getAttribute('name') ??
        ''
      )
        .trim()
        .slice(0, 40);
      return {
        id: el.getAttribute('data-kb'),
        outlined: outlined || style.boxShadow !== 'none',
        name: `${el.tagName.toLowerCase()} "${label}"`,
      };
    });
    if (!focused?.id) continue;
    if (reached.has(focused.id)) break; // back at the start: the whole page was walked
    reached.add(focused.id);
    if (!focused.outlined) unmarked.push(focused.name);
  }

  const unreachable = await page.evaluate(
    (ids) => {
      const seen = new Set(ids);
      const groups = new Set<string>();
      const missed: string[] = [];
      for (const el of document.querySelectorAll('[data-kb]')) {
        if (seen.has(el.getAttribute('data-kb')!)) {
          if (el instanceof HTMLInputElement && el.type === 'radio') groups.add(el.name);
        }
      }
      for (const el of document.querySelectorAll('[data-kb]')) {
        if (seen.has(el.getAttribute('data-kb')!)) continue;
        // A radio group is one stop: arrows move inside it.
        if (el instanceof HTMLInputElement && el.type === 'radio' && groups.has(el.name)) continue;
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
        missed.push(`${el.tagName.toLowerCase()} "${label}"`);
      }
      return missed;
    },
    [...reached],
  );
  return { unreachable, unmarked };
}

const KEYBOARD_PAGES = [
  '/he',
  '/he/news',
  '/he/events',
  '/he/education',
  '/he/education/exam',
  '/he/guidelines',
  '/he/search?q=demo',
  '/he/login',
  '/en/register',
];

test('keyboard: every control is reachable and shows where the focus is', async ({ browser }) => {
  const visitor = await newPage(browser);
  const member = await newPage(browser);
  await signIn(member, 'en', MEMBER, DEMO_PASSWORD);
  await expectSignedIn(member, MEMBER);
  const found: Record<string, unknown> = {};
  const check = async (page: Page, path: string, who: string) => {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    const result = await keyboardPass(page);
    if (result.unreachable.length || result.unmarked.length) found[`${who} ${path}`] = result;
  };
  for (const path of KEYBOARD_PAGES) await check(visitor, path, 'visitor');
  for (const path of [
    '/he',
    '/he/account/profile',
    '/he/account/notifications',
    '/he/account/notifications/preferences',
    '/he/members',
  ]) {
    await check(member, path, 'member');
  }
  expect(found).toEqual({});
});

test('keyboard: the skip link, the account menu and the exam question work without a mouse', async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, 'en', MEMBER, DEMO_PASSWORD);
  await expectSignedIn(page, MEMBER);

  // The first Tab reaches "skip to content", and it moves the focus into the page.
  await page.goto('/en/news');
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);

  // The account menu: opens with Enter, its links follow in Tab order, Escape closes it and
  // returns the focus to its button.
  const menuButton = page.getByRole('button', { name: /Account menu/ });
  await menuButton.focus();
  await page.keyboard.press('Enter');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'My profile' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toBeFocused();
  // Leaving the menu with Tab closes it too, so it never covers what has the focus.
  await page.keyboard.press('Enter');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Shift+Tab');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
});

const REFLOW_PAGES = [
  '/he',
  '/en',
  '/he/news',
  '/he/events',
  '/he/education',
  '/he/education/exam',
  '/he/guidelines',
  '/he/search?q=demo',
  '/he/login',
  '/en/register',
  '/he/accessibility',
];

test('reflow: no sideways scrolling at 320 px (as at 400% zoom)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const visitor = await context.newPage();
  const memberContext = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const member = await memberContext.newPage();
  await signIn(member, 'en', MEMBER, DEMO_PASSWORD);
  await expect(member.getByTestId('member-dashboard')).toBeVisible();

  const found: Record<string, string> = {};
  const check = async (page: Page, path: string, who: string) => {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { content, width } = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    if (content > width + 1) found[`${who} ${path}`] = `${content}px of content in ${width}px`;
  };
  for (const path of REFLOW_PAGES) await check(visitor, path, 'visitor');
  for (const path of [
    '/he',
    '/he/account/profile',
    '/he/organisations/demo-urological-society',
    '/he/organisations/demo-urological-society/membership/card',
    '/he/account/notifications',
    '/he/account/notifications/preferences',
    '/he/members',
  ]) {
    await check(member, path, 'member');
  }
  expect(found).toEqual({});
});
