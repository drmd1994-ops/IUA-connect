import AxeBuilder from '@axe-core/playwright';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createAdmin, signIn, uniqueEmail } from './helpers';

/**
 * M6 exit tests (docs/plans/M6-education.md §1, §8). An editor writes an article and a course and
 * a reviewer publishes them; a visitor reads the course and its lesson. An editor writes an exam
 * question, a reviewer corrects and publishes it, and readers answer it: they see the right
 * answer, why each option is right or wrong, and the summary; a signed-in reader sees it in
 * their results. Plus axe on every new page. The text is test filler, not medical content.
 */
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

/** An editor and a reviewer, each signed in on their own page. */
async function staff(browser: Browser, label: string) {
  const editor = await newPage(browser, true);
  const reviewer = await newPage(browser, true);
  const editorEmail = uniqueEmail(`${label}-editor`);
  await signInAndAddPasskey(editor, editorEmail, createAdmin(editorEmail, 'CONTENT_EDITOR'));
  const reviewerEmail = uniqueEmail(`${label}-reviewer`);
  await signInAndAddPasskey(reviewer, reviewerEmail, createAdmin(reviewerEmail));
  return { editor, reviewer };
}

/** The reviewer opens an item from the review queue and publishes it. */
async function publishItem(reviewer: Page, title: string) {
  await reviewer.goto('/en/admin/education');
  await reviewer.getByTestId('education-table').getByRole('link', { name: title }).click();
  await reviewer.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(reviewer.getByTestId('education-status')).toHaveText('Published');
}

/**
 * Practises until the question with this stem is asked. Questions come in random order, so the
 * others that match the filters are answered and passed.
 */
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

test.setTimeout(240_000);

test('editor writes an article and a course → reviewer publishes → a visitor reads them', async ({
  browser,
}) => {
  const { editor, reviewer } = await staff(browser, 'm6');
  const visitor = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const article = { en: `Lesson article ${suffix}`, he: `מאמר שיעור ${suffix}` };
  const course = { en: `Test course ${suffix}`, he: `קורס בדיקה ${suffix}` };

  // The editor writes an article in both languages and submits it.
  await editor.goto('/en/admin/education/new');
  await expectAccessible(editor);
  await editor.getByLabel('Type', { exact: true }).selectOption('ARTICLE');
  await editor.getByLabel('Title', { exact: true }).fill(article.he);
  await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('גוף המאמר בעברית.');
  await editor.getByRole('tab', { name: 'English' }).click();
  await editor.getByLabel('Title', { exact: true }).fill(article.en);
  await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('The article body.');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByTestId('education-status')).toHaveText('Draft');
  await editor.getByRole('button', { name: 'Submit for review' }).click();
  await expect(editor.getByTestId('education-status')).toHaveText('Waiting for review');
  // An editor can't publish: there are no review actions for them.
  await expect(editor.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);

  // The reviewer's list opens on the review queue.
  await reviewer.goto('/en/admin/education');
  await expect(reviewer.getByTestId('education-table')).toContainText(article.en);
  await expectAccessible(reviewer);
  await publishItem(reviewer, article.en);
  await expectAccessible(reviewer);

  // The editor builds a course with the article as its lesson.
  await editor.goto('/en/admin/education/new');
  await editor.getByLabel('Type', { exact: true }).selectOption('COURSE');
  await editor.getByLabel('Title', { exact: true }).fill(course.he);
  await editor.getByRole('tab', { name: 'English' }).click();
  await editor.getByLabel('Title', { exact: true }).fill(course.en);
  await editor.getByRole('textbox', { name: 'Description', exact: true }).fill('About the course.');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByTestId('education-status')).toHaveText('Draft');
  await editor.getByLabel('Add a lesson').selectOption({ label: article.en });
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(editor.getByTestId('admin-lessons')).toContainText(article.en);
  await editor.getByRole('button', { name: 'Save lessons' }).click();
  await expect(editor.getByText('The lessons were saved.')).toBeVisible();
  await expectAccessible(editor);
  await editor.getByRole('button', { name: 'Submit for review' }).click();
  await expect(editor.getByTestId('education-status')).toHaveText('Waiting for review');
  await publishItem(reviewer, course.en);

  // A visitor finds the course in the library and reads its lesson.
  await visitor.goto('/en/education');
  await expect(visitor.getByRole('heading', { name: 'Education', level: 1 })).toBeVisible();
  await visitor.getByLabel('Type', { exact: true }).selectOption('COURSE');
  await visitor.getByTestId('education-list').getByRole('link', { name: course.en }).click();
  await expect(
    visitor.getByTestId('education-item').getByRole('heading', { name: course.en }),
  ).toBeVisible();
  await expectAccessible(visitor);
  await visitor.getByTestId('course-lessons').getByRole('link', { name: article.en }).click();
  const item = visitor.getByTestId('education-item');
  await expect(item.getByRole('heading', { name: article.en })).toBeVisible();
  await expect(item).toContainText('The article body.');
  await expectAccessible(visitor);

  // The same article in Hebrew, right to left.
  await visitor.goto(visitor.url().replace('/en/', '/he/'));
  await expect(
    visitor.getByTestId('education-item').getByRole('heading', { name: article.he }),
  ).toBeVisible();
  await expectAccessible(visitor);
});

test('an exam question is written, corrected and published → readers answer it and see why', async ({
  browser,
}) => {
  const { editor, reviewer } = await staff(browser, 'm6-exam');
  const visitor = await newPage(browser);
  const suffix = Date.now().toString().slice(-6);
  const stem = `Test question ${suffix}: which option is marked right?`;
  const right = `The marked option ${suffix}`;
  const wrong = `The other option ${suffix}`;
  const corrected = `Corrected by the reviewer ${suffix}.`;
  const summary = `A short summary of the test topic ${suffix}.`;

  // The editor writes a question with two options, in both languages, and submits it.
  await editor.goto('/en/admin/education/questions/new');
  await expectAccessible(editor);
  await editor.getByRole('button', { name: 'Remove option 4' }).click();
  await editor.getByRole('button', { name: 'Remove option 3' }).click();
  await editor.getByLabel('The question').fill(`שאלת בדיקה ${suffix}`);
  await editor.getByLabel('Option 1: text').fill('התשובה המסומנת');
  await editor.getByLabel('Option 1: explanation').fill('זו התשובה שסומנה.');
  await editor.getByLabel('Option 2: text').fill('התשובה האחרת');
  await editor.getByLabel('Option 2: explanation').fill('זו לא התשובה שסומנה.');
  await editor.getByLabel('Short summary of the topic').fill('סיכום קצר לבדיקה.');
  await editor.getByRole('tab', { name: 'English' }).click();
  await editor.getByLabel('The question').fill(stem);
  await editor.getByLabel('Option 1: text').fill(right);
  await editor.getByLabel('Option 1: explanation').fill('First wording.');
  await editor.getByLabel('Option 2: text').fill(wrong);
  await editor.getByLabel('Option 2: explanation').fill('It was not marked.');
  await editor.getByLabel('Short summary of the topic').fill(summary);
  await editor.getByLabel('Option 1 is the right answer').check();
  await editor.getByLabel('Level', { exact: true }).selectOption('EXPERT');
  await editor.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Urolithiasis' });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByTestId('question-status')).toHaveText('Draft');
  await editor.getByRole('button', { name: 'Submit for review' }).click();
  await expect(editor.getByTestId('question-status')).toHaveText('Waiting for review');
  await expect(editor.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);

  // Not asked before it is published.
  await visitor.goto('/en/education/exam');
  await visitor.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Urolithiasis' });
  await visitor.getByLabel('Level', { exact: true }).selectOption('EXPERT');
  await visitor.waitForLoadState('networkidle');
  await expect(visitor.getByText(stem)).toHaveCount(0);

  // The reviewer corrects an explanation and publishes what is on the screen.
  await reviewer.goto('/en/admin/education/questions');
  await reviewer.getByLabel('Search in the question text').fill(suffix);
  await reviewer.getByRole('button', { name: 'Search', exact: true }).click();
  await expectAccessible(reviewer);
  await reviewer.getByTestId('questions-table').getByRole('link', { name: stem }).click();
  await reviewer.getByRole('tab', { name: 'English' }).click();
  await reviewer.getByLabel('Option 1: explanation').fill(corrected);
  await reviewer.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(reviewer.getByTestId('question-status')).toHaveText('Published');
  await expectAccessible(reviewer);

  // A visitor answers it right: the answer, why each option is right or wrong, and the summary.
  await visitor.reload();
  await visitor.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Urolithiasis' });
  await visitor.getByLabel('Level', { exact: true }).selectOption('EXPERT');
  await reach(visitor, stem);
  await expectAccessible(visitor);
  await visitor.getByRole('radio', { name: right }).check();
  await visitor.getByRole('button', { name: 'Check my answer' }).click();
  const result = visitor.getByTestId('exam-result');
  await expect(result.getByRole('heading', { name: 'Right.' })).toBeVisible();
  await expect(result).toContainText('The right answer');
  await expect(result).toContainText('Why this is right');
  await expect(result).toContainText(corrected);
  await expect(result).toContainText('Why this is wrong');
  await expect(result).toContainText('It was not marked.');
  await expect(result).toContainText(summary);
  await expect(result).toContainText('Sign in to save your answers and see your results.');
  await expectAccessible(visitor);

  // A signed-in reader answers it wrong: it is saved, and shows in their results.
  await editor.goto('/en/education/exam');
  await editor.getByLabel('Subspecialty', { exact: true }).selectOption({ label: 'Urolithiasis' });
  await editor.getByLabel('Level', { exact: true }).selectOption('EXPERT');
  await reach(editor, stem);
  await editor.getByRole('radio', { name: wrong }).check();
  await editor.getByRole('button', { name: 'Check my answer' }).click();
  const saved = editor.getByTestId('exam-result');
  await expect(saved.getByRole('heading', { name: 'Not right.' })).toBeVisible();
  await expect(saved).toContainText('Your answer');
  await expect(saved).toContainText('Your answer was saved.');
  await editor.getByRole('link', { name: 'My results' }).click();
  await expect(editor.getByRole('heading', { name: 'My exam results', level: 1 })).toBeVisible();
  const row = editor.getByTestId('exam-results').getByRole('listitem').filter({ hasText: stem });
  await expect(row).toContainText('First answer: not right');
  await expect(row).toContainText('Answered once');
  await expectAccessible(editor);
});
