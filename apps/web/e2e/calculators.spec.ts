import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

/**
 * M30 (docs/plans/M30-clinical-calculators.md): a visitor, signed in or not, opens a calculator,
 * is told what is wrong with what they typed, and gets a result with its source and disclaimer.
 * Nothing typed is sent anywhere.
 */
async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test('a visitor works out an eGFR, and nothing typed leaves the page', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') sent.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/en');
  await page.getByRole('navigation').getByRole('link', { name: 'Calculators' }).click();
  await expect(page.getByRole('heading', { name: 'Clinical calculators', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'eGFR (CKD-EPI 2021)' }).click();
  await expect(page).toHaveURL(/\/en\/calculators\/egfr$/);
  await expect(page.getByText('Checked by Dr. Dahamshy on October 19, 2026.')).toBeVisible();

  // Too young for the equation: no number, the range instead.
  await page.getByLabel('Age (years)').fill('17');
  await page.getByRole('radio', { name: 'Male', exact: true }).check();
  await page.getByLabel('Serum creatinine (mg/dL)').fill('1');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByText('Check the fields marked below.')).toBeVisible();
  await expect(page.getByText('Enter a number from 18 to 120 years.')).toBeVisible();
  await expect(page.getByTestId('calculator-result')).toHaveCount(0);

  await page.getByLabel('Age (years)').fill('60');
  await page.getByRole('button', { name: 'Calculate' }).click();
  const result = page.getByTestId('calculator-result');
  await expect(result).toContainText('86');
  await expect(result).toContainText('G2: mildly decreased (60 to 89).');
  await expect(page.getByText(/An aid to clinical judgement/)).toBeVisible();
  await expectAccessible(page);

  // The same creatinine in µmol/L; the unit in the label follows the choice.
  await page.getByRole('radio', { name: 'µmol/L' }).check();
  await page.getByLabel('Serum creatinine (µmol/L)').fill('88');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(result).toContainText('87');

  expect(sent).toEqual([]);
});

test('IPSS in Hebrew says its wording is not a validated translation', async ({ page }) => {
  await page.goto('/he/calculators/ipss');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByText('הנוסח העברי של השאלון הזה הוא שלנו, ואינו תרגום מתוקף.'),
  ).toBeVisible();
  const groups = page.getByRole('group');
  await expect(groups).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    await groups
      .nth(index)
      .getByRole('radio')
      .nth(index === 7 ? 3 : 2)
      .check();
  }
  await page.getByRole('button', { name: 'חישוב' }).click();
  // Seven answers of 2 points: 14, moderate; quality of life apart.
  await expect(page.getByTestId('calculator-result')).toContainText('14');
  await expect(page.getByTestId('calculator-result')).toContainText('8 עד 19: תסמינים בינוניים.');
  await expectAccessible(page);

  await page.goto('/en/calculators/ipss');
  await expect(page.getByText(/not a validated translation/)).toHaveCount(0);
});
