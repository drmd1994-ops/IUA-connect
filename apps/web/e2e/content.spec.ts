import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M3 exit test (docs/plans/M3-content-core.md §1, §8): an editor writes an article with an image
 * and submits it; a reviewer schedules it; it appears on /news once the job has run. A
 * members-only article stays hidden from a visitor. Plus a guideline, and axe on every new page.
 */
// A 1×1 PNG. The API re-encodes it like any other upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
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

/** "YYYY-MM-DDTHH:mm" in Israel, the value the schedule field expects. */
function israelLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Writes an article in both languages and submits it for review. */
async function writeAndSubmit(
  editor: Page,
  article: { en: string; he: string; membersOnly?: boolean; image?: boolean },
) {
  await editor.goto('/en/admin/news/new');
  await editor.getByLabel('Title', { exact: true }).fill(article.he);
  await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('גוף הידיעה בעברית.');
  await editor.getByRole('tab', { name: 'English' }).click();
  await editor.getByLabel('Title', { exact: true }).fill(article.en);
  await editor.getByLabel('Summary', { exact: true }).fill('A short summary.');
  await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('The article body.');
  if (article.membersOnly) await editor.getByLabel('Who can read').selectOption('MEMBERS');
  if (article.image) {
    await editor
      .getByLabel('Upload an image')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(editor.getByRole('button', { name: 'Remove image' })).toBeVisible();
  }
  await editor.getByRole('button', { name: 'Submit for review' }).click();
  await expect(editor.getByTestId('news-status')).toHaveText('Waiting for review');
}

test.setTimeout(420_000);

test('editor writes → reviewer schedules → the article appears; members-only stays hidden', async ({
  browser,
}) => {
  const editor = await newPage(browser, true);
  const reviewer = await newPage(browser, true);
  const visitor = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const scheduled = { en: `Scheduled article ${suffix}`, he: `ידיעה מתוזמנת ${suffix}` };
  const members = { en: `Members article ${suffix}`, he: `ידיעה לחברים ${suffix}` };

  const editorEmail = uniqueEmail('m3-editor');
  // The editor works in the demo's organisation: only an organisation's news can be for its members.
  await signInAndAddPasskey(
    editor,
    editorEmail,
    createAdmin(editorEmail, 'CONTENT_EDITOR', 'first-organisation'),
  );
  const reviewerEmail = uniqueEmail('m3-reviewer');
  await signInAndAddPasskey(reviewer, reviewerEmail, createAdmin(reviewerEmail));

  // The editor's admin area has the dashboard and their own screens, not Members.
  await editor.goto('/en/admin');
  await expect(editor.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  const adminNav = editor.getByRole('navigation', { name: 'Administration sections' });
  await expect(adminNav.getByRole('link', { name: 'News', exact: true })).toBeVisible();
  await expect(editor.getByRole('link', { name: 'Members', exact: true })).toHaveCount(0);
  await editor.goto('/en/admin/news/new');
  await expectAccessible(editor);
  await writeAndSubmit(editor, { ...scheduled, image: true });
  await expectAccessible(editor);
  await writeAndSubmit(editor, { ...members, membersOnly: true });

  // An editor can't publish: there are no review actions for them.
  await expect(editor.getByRole('button', { name: 'Publish now' })).toHaveCount(0);

  // The reviewer's list opens on the review queue. Publish the members-only article now.
  await reviewer.goto('/en/admin/news');
  await expect(reviewer.getByTestId('news-table')).toContainText(members.en);
  await expectAccessible(reviewer);
  await reviewer.getByRole('link', { name: members.en }).click();
  await reviewer.getByRole('button', { name: 'Publish now' }).click();
  await expect(reviewer.getByTestId('news-status')).toHaveText('Published');

  // Schedule the other one: the next whole minute that is at least a minute away.
  await reviewer.goto('/en/admin/news');
  await reviewer.getByRole('link', { name: scheduled.en }).click();
  const publishAt = new Date(Math.ceil((Date.now() + 60_000) / 60_000) * 60_000);
  await reviewer.getByLabel('Publish at').fill(israelLocal(publishAt));
  await reviewer.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(reviewer.getByTestId('news-status')).toHaveText('Scheduled');
  await expect(reviewer.getByTestId('scheduled-for')).toBeVisible();
  await expectAccessible(reviewer);

  // Not public yet; and the members-only article is hidden from a visitor, in the list and by link.
  await visitor.goto('/en/news');
  await expect(visitor.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();
  await visitor.waitForLoadState('networkidle');
  await expect(visitor.getByText(scheduled.en)).toHaveCount(0);
  await expect(visitor.getByText(members.en)).toHaveCount(0);
  await expectAccessible(visitor);
  await reviewer.getByRole('link', { name: 'Back to news' }).click();
  await reviewer.getByLabel('Status').selectOption('PUBLISHED');
  await reviewer.getByRole('link', { name: members.en }).click();
  const membersUrl = await reviewer
    .getByRole('link', { name: 'View on the site' })
    .getAttribute('href');
  await visitor.goto(membersUrl!);
  await expect(visitor.getByRole('heading', { name: 'Not found' })).toBeVisible();
  // The reviewer has no membership either, but staff can still preview it in the admin area.

  // The job runs every minute: the article appears on the public list.
  await expect(async () => {
    await visitor.goto('/en/news');
    await expect(visitor.getByRole('link', { name: scheduled.en })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 240_000, intervals: [10_000] });
  await expect(visitor.getByText(members.en)).toHaveCount(0);

  await visitor.getByRole('link', { name: scheduled.en }).click();
  const article = visitor.getByTestId('news-article');
  await expect(article.getByRole('heading', { name: scheduled.en })).toBeVisible();
  await expect(article).toContainText('The article body.');
  await expect(article.getByRole('img')).toBeVisible();
  await expectAccessible(visitor);

  // The same article in Hebrew, right to left.
  await visitor.goto(visitor.url().replace('/en/', '/he/'));
  await expect(
    visitor.getByTestId('news-article').getByRole('heading', { name: scheduled.he }),
  ).toBeVisible();
  await expectAccessible(visitor);
});

test('an admin adds a guideline with a version; visitors see it with its official link', async ({
  browser,
}) => {
  const admin = await newPage(browser, true);
  const visitor = await newPage(browser);
  const title = `Fictional guideline ${Date.now().toString().slice(-6)}`;

  const email = uniqueEmail('m3-guidelines');
  await signInAndAddPasskey(admin, email, createAdmin(email));
  await admin.goto('/en/admin/guidelines');
  await admin.getByRole('button', { name: 'Add a guideline' }).click();
  await admin.getByLabel('Source organisation').fill('Example Urology Society');
  await admin.getByLabel('Official link').fill('https://guidelines.example.test/demo');
  await admin.getByLabel('Title in English').fill(title);
  await admin.getByLabel('IUA summary in English').fill('A short summary written for the demo.');
  await admin.getByLabel('Evidence level').fill('Strong');
  await admin.getByLabel('Version', { exact: true }).fill('2026');
  await admin.getByLabel('Publication date').fill('2026-03-01');
  await expectAccessible(admin);
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(admin.getByTestId('admin-guidelines')).toContainText(title);

  await visitor.goto('/en/guidelines');
  await visitor.getByRole('link', { name: title }).click();
  const guideline = visitor.getByTestId('guideline');
  await expect(guideline.getByRole('heading', { name: title })).toBeVisible();
  await expect(guideline).toContainText('Example Urology Society');
  await expect(guideline).toContainText('Current');
  await expect(visitor.getByRole('link', { name: 'Open the official guideline' })).toHaveAttribute(
    'href',
    'https://guidelines.example.test/demo',
  );
  await expect(visitor.getByText('A short summary written for the demo.')).toBeVisible();
  await expectAccessible(visitor);
});

test('imported items show their source, and documents show the year only (M4)', async ({
  page,
}) => {
  // Loaded by the seed's import layer from the committed fixtures.
  const title = 'דף מידע לציבור: מחלת פירוני';
  await page.goto('/he/news');
  const card = page.getByRole('listitem').filter({ hasText: title });
  await expect(card).toContainText('מקור: אתר האיגוד');
  await card.getByRole('link', { name: title }).click();

  const article = page.getByTestId('news-article');
  await expect(article.getByRole('heading', { name: title })).toBeVisible();
  await expect(article).toContainText('31 בינואר 2026');
  const source = page.getByTestId('news-source');
  await expect(source).toContainText('מקור: אתר האיגוד');
  await expect(source.getByRole('link')).toHaveAttribute(
    'href',
    'https://urology.ima.org.il/ViewArticle.aspx?aId=8399',
  );
  await expectAccessible(page);

  await page.goto('/he/guidelines');
  const paper = page
    .getByRole('listitem')
    .filter({ hasText: 'נייר עמדה בנושא סרטן הערמונית - 2022' });
  await expect(paper).toContainText('גרסה 2022 · 2022');
  await expect(paper).not.toContainText('בינואר');
  await paper.getByRole('link').click();
  await expect(page.getByRole('link', { name: 'פתיחת ההנחיה הרשמית' })).toHaveAttribute(
    'href',
    'https://ima-contentfiles.s3.amazonaws.com/ProstateCancerGuidelines112022.pdf',
  );
  await expectAccessible(page);
});
