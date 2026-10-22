import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M23 exit tests (docs/plans/M23-question-bank.md §6): a question with its difficulty, references
 * and reviewer; practice with bookmarks and "the ones I got wrong"; a report the reviewers answer;
 * a mock exam from start to review; progress; and the spreadsheet import. Axe on every new page.
 * The text is test filler, not medical content.
 */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function staffPage(browser: Browser, email: string, role?: string) {
  const page = await (await browser.newContext()).newPage();
  await addVirtualAuthenticator(page);
  await signIn(page, 'en', email, createAdmin(email, role));
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.getByLabel('Passkey name').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
  return page;
}

/** Practises until the question with this stem is asked, passing the others. */
async function reach(page: Page, stem: string) {
  const question = page.getByTestId('exam-question');
  for (let attempt = 0; attempt < 40; attempt++) {
    const legend = question.locator('legend');
    await expect(legend).toBeVisible();
    if ((await legend.innerText()).trim() === stem) return;
    await question.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByTestId('exam-result')).toBeVisible();
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByTestId('exam-result')).toHaveCount(0);
  }
  throw new Error(`The question was never asked: ${stem}`);
}

async function filters(page: Page) {
  await page.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Andrology' });
  await page.getByLabel('Level', { exact: true }).selectOption('FELLOW');
}

test.setTimeout(300_000);

test('a reviewed question with references → practice, bookmark, report → the reviewers answer', async ({
  browser,
}) => {
  const editor = await staffPage(browser, uniqueEmail('m23-editor'), 'CONTENT_EDITOR');
  const reviewer = await staffPage(browser, uniqueEmail('m23-reviewer'));
  const suffix = Date.now().toString().slice(-6);
  const stem = `Bank question ${suffix}: which option is marked right?`;
  const right = `The marked option ${suffix}`;
  const wrong = `The other option ${suffix}`;
  const reference = `A made-up guideline ${suffix}`;

  // The editor writes it with a difficulty, a reference and its source, and submits it.
  await editor.goto('/en/admin/education/questions/new');
  await editor.getByRole('button', { name: 'Remove option 4' }).click();
  await editor.getByRole('button', { name: 'Remove option 3' }).click();
  await editor.getByLabel('The question').fill(`שאלת בנק ${suffix}`);
  await editor.getByLabel('Option 1: text').fill('המסומנת');
  await editor.getByLabel('Option 1: explanation').fill('זו שסומנה.');
  await editor.getByLabel('Option 2: text').fill('האחרת');
  await editor.getByLabel('Option 2: explanation').fill('זו שלא סומנה.');
  await editor.getByLabel('Short summary of the topic').fill('סיכום לבדיקה.');
  await editor.getByRole('tab', { name: 'English' }).click();
  await editor.getByLabel('The question').fill(stem);
  await editor.getByLabel('Option 1: text').fill(right);
  await editor.getByLabel('Option 1: explanation').fill('It was marked.');
  await editor.getByLabel('Option 2: text').fill(wrong);
  await editor.getByLabel('Option 2: explanation').fill('It was not marked.');
  await editor.getByLabel('Short summary of the topic').fill(`Summary ${suffix}.`);
  await editor.getByLabel('Option 1 is the right answer').check();
  await editor.getByLabel('Level', { exact: true }).selectOption('FELLOW');
  await editor.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Andrology' });
  await editor.getByLabel('Difficulty').selectOption('HARD');
  await editor.getByRole('button', { name: 'Add a reference' }).click();
  await editor.getByLabel('Reference 1: title').fill(reference);
  await editor.getByLabel('Reference 1: web address (optional)').fill('https://example.org/guide');
  await editor.getByLabel('Source (seen by reviewers only)').fill('Written new for the test');
  await expectAccessible(editor);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByTestId('question-status')).toHaveText('Draft');
  await editor.getByRole('button', { name: 'Submit for review' }).click();
  await expect(editor.getByTestId('question-status')).toHaveText('Waiting for review');

  // The reviewer publishes it; the question now says when it was reviewed.
  await reviewer.goto('/en/admin/education/questions');
  await reviewer.getByLabel('Search in the question text').fill(suffix);
  await reviewer.getByRole('main').getByRole('button', { name: 'Search', exact: true }).click();
  await reviewer.getByTestId('questions-table').getByRole('link', { name: stem }).click();
  await reviewer.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(reviewer.getByTestId('question-status')).toHaveText('Published');
  await expect(reviewer.getByTestId('reviewed-by')).toContainText('Reviewed');
  await expect(reviewer.getByTestId('question-statistics')).toContainText(
    'Shown once at least 5 people answered',
  );

  // A signed-in reader practises it: the difficulty, a bookmark, a wrong answer, the references.
  await editor.goto('/en/education/exam');
  await filters(editor);
  await reach(editor, stem);
  const question = editor.getByTestId('exam-question');
  await expect(question.getByRole('heading', { level: 2 })).toContainText('Hard');
  await question.getByTestId('exam-bookmark').click();
  await expect(question.getByTestId('exam-bookmark')).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('radio', { name: wrong }).check();
  await editor.getByRole('button', { name: 'Check my answer' }).click();
  const result = editor.getByTestId('exam-result');
  await expect(result.getByRole('heading', { name: 'Not right.' })).toBeVisible();
  await expect(result.getByTestId('exam-references')).toContainText(reference);
  await expect(result.getByTestId('reviewed-by')).toContainText('Reviewed');
  await expectAccessible(editor);

  // They report it.
  await result.getByRole('button', { name: 'Something wrong with this question?' }).click();
  await result.getByLabel('The marked answer isn’t right').check();
  await result.getByLabel('Details').fill(`I think option 2 ${suffix}`);
  await expectAccessible(editor);
  await result.getByRole('button', { name: 'Send to the reviewers' }).click();
  await expect(result.getByTestId('exam-report-sent')).toBeVisible();

  // "The ones I got wrong" brings it back.
  await editor.getByLabel('Practise').selectOption('wrong');
  await expect(question.locator('legend')).toHaveText(stem);

  // The results page: the bookmark, the report waiting, the topic.
  await editor.goto('/en/account/exam-results');
  await expect(editor.getByTestId('exam-bookmarks')).toContainText(stem);
  await expect(editor.getByTestId('my-exam-reports')).toContainText('waiting for the reviewers');
  await expect(editor.getByTestId('progress-topics')).toContainText('Andrology');
  await expectAccessible(editor);

  // The reviewers answer the report without seeing who sent it.
  await reviewer.goto('/en/admin/education/reports');
  const report = reviewer
    .getByTestId('exam-reports')
    .getByRole('listitem')
    .filter({ hasText: stem });
  await expect(report).toContainText(`I think option 2 ${suffix}`);
  await expectAccessible(reviewer);
  await report.getByLabel('The question stays as it is').check();
  await report.getByLabel('Your answer to the reader').fill(`Option 1 is right ${suffix}.`);
  await report.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    reviewer.getByTestId('exam-reports').getByRole('listitem').filter({ hasText: stem }),
  ).toHaveCount(0);

  await editor.reload();
  await expect(editor.getByTestId('my-exam-reports')).toContainText(`Option 1 is right ${suffix}.`);
});

test('a mock exam: chosen, sat against the clock, and reviewed at the end', async ({ browser }) => {
  const reader = await staffPage(browser, uniqueEmail('m23-mock'), 'CONTENT_EDITOR');
  await reader.goto('/en/education/exam/mock');
  await expectAccessible(reader);
  await reader.getByLabel('10 questions (15 minutes)').check();
  await reader.getByRole('button', { name: 'Start the exam' }).click();
  await expect(reader).toHaveURL(/\/en\/education\/exam\/mock\/[0-9a-f-]{36}$/);
  await expect(reader.getByTestId('mock-clock')).toContainText(/\d+:\d\d/);
  const question = reader.getByTestId('mock-question');
  await question.getByRole('radio').first().check();
  await expect(reader.getByText(/^Answered 1 of \d+$/)).toBeVisible();
  // No answer is shown while the exam runs.
  await expect(reader.getByText('The right answer')).toHaveCount(0);
  await expectAccessible(reader);

  await reader.getByRole('button', { name: 'Finish' }).click();
  await reader.getByRole('button', { name: 'End the exam' }).click();
  await expect(reader.getByRole('heading', { name: 'Your result', level: 1 })).toBeVisible();
  await expect(reader.getByTestId('mock-score')).toContainText(/of \d+ right/);
  await expect(reader.getByTestId('mock-review')).toContainText('The right answer');
  await expectAccessible(reader);

  await reader.goto('/en/education/exam/mock');
  await expect(reader.getByTestId('mock-exams')).toContainText(/of \d+ right/);
});

test('questions are imported from a spreadsheet as drafts, or the file is refused row by row', async ({
  browser,
}) => {
  const editor = await staffPage(browser, uniqueEmail('m23-import'), 'CONTENT_EDITOR');
  await editor.goto('/en/admin/education/questions');
  await editor.getByRole('link', { name: 'Import from a spreadsheet' }).click();
  await expect(editor.getByRole('heading', { name: 'Import questions', level: 1 })).toBeVisible();
  await expectAccessible(editor);

  const download = editor.waitForEvent('download');
  await editor.getByRole('button', { name: 'the template (CSV)' }).click();
  expect((await download).suggestedFilename()).toBe('exam-questions-template.csv');

  const suffix = Date.now().toString().slice(-6);
  const header = 'stem_he,option_1_he,explanation_1_he,option_2_he,explanation_2_he,correct,source';
  const file = (rows: string[]) => ({
    name: 'questions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([header, ...rows].join('\r\n'), 'utf8'),
  });
  const input = editor.getByLabel('The file');

  await input.setInputFiles(file([`שאלה מיובאת ${suffix},כן,הסבר,לא,הסבר,3,נכתבה לבדיקה`]));
  await editor.getByRole('button', { name: 'Import', exact: true }).click();
  const problems = editor.getByTestId('import-problems');
  await expect(problems).toContainText('Nothing was imported: one problem.');
  await expect(problems).toContainText('There is no option with this number.');
  await expectAccessible(editor);

  await input.setInputFiles(file([`שאלה מיובאת ${suffix},כן,הסבר,לא,הסבר,1,נכתבה לבדיקה`]));
  await editor.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(editor.getByText('One question was imported as a draft.')).toBeVisible();
  await editor.getByRole('link', { name: 'See the drafts' }).click();
  await editor.getByLabel('Search in the question text').fill(suffix);
  await editor.getByRole('main').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    editor.getByTestId('questions-table').getByRole('row').filter({ hasText: suffix }),
  ).toContainText('Draft');
});
