import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * M36 exit test (docs/plans/M36-medical-imaging.md §6): a resident adds a made-up scan to a case
 * (two 32 × 32 slices of drawn shapes, e2e/fixtures; the name in them is made up too, and is
 * removed on upload), saves it, and opens it in the viewer, which says it is for education only.
 */
const DEMO_PASSWORD = 'ilikeIUAconnect11';
const AUTHOR = 'member.resident@demo.test';
const SCAN = ['phantom-1.dcm', 'phantom-2.dcm'].map((name) =>
  path.join(__dirname, 'fixtures', name),
);

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test.setTimeout(240_000);

test('a scan is added to a case, cleaned, and opened in the viewer', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'en', AUTHOR, DEMO_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/en/cases/new');
  const form = page.locator('#main');
  await expect(form.getByRole('heading', { name: 'Present a case' })).toBeVisible();
  await form.getByLabel('Title').fill(`A made-up case with a scan ${Date.now()}`);
  await form.getByLabel('Subspecialty').selectOption({ label: 'Andrology' });
  await form.getByLabel('Age range').selectOption('FROM_40_TO_64');
  await form.getByLabel('Sex').selectOption('MALE');
  await form
    .getByLabel('Presenting problem and history')
    .fill('A made-up case. Left flank pain for two days.');
  await form.getByLabel('Your question to colleagues').fill('What would you do?');

  // The scan can be added only after confirming the images show nothing identifying.
  const picker = form.getByTestId('scan-picker');
  await expect(picker.getByLabel('Add a scan: choose files')).toBeDisabled();
  await picker
    .getByLabel('I confirm nothing on these scans’ images shows a name, number, date or face.')
    .check();
  await picker.getByLabel('Add a scan: choose files').setInputFiles(SCAN);
  await expect(picker.getByText('CT: 1 series, 2 images')).toBeVisible();
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Save as a draft' }).click();
  await expect(page).toHaveURL(/\/en\/cases\/[0-9a-f-]+$/);

  const scans = page.getByTestId('scans');
  await expect(
    scans.getByText('For education and discussion only.', { exact: false }),
  ).toBeVisible();
  await expectAccessible(page);
  const [viewer] = await Promise.all([
    page.context().waitForEvent('page'),
    scans.getByRole('link', { name: 'View the scan' }).click(),
  ]);
  await expect(viewer).toHaveURL(/\/viewer\/viewer\/medconnect\?/, { timeout: 30_000 });
  await expect(
    viewer.getByText('For education and discussion only. Not for diagnosis or patient care.'),
  ).toBeVisible({ timeout: 60_000 });
  // The made-up name in the files was removed before they were stored.
  await expect(viewer.getByText('Phantom')).toHaveCount(0);
});
