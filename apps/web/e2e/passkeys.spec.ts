import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  addVirtualAuthenticator,
  createAdmin,
  expectSignedIn,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * Passkeys (M1b) with Chromium's virtual authenticator, which behaves like Windows Hello with
 * user verification. A real Windows Hello prompt is checked by hand at the demo.
 */
test('an administrator adds a passkey, then signs in with it alone', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const email = uniqueEmail('passkey-admin');
  const password = createAdmin(email);

  // First sign-in with the password: administrators are sent to set up two-step verification.
  await signIn(page, 'en', email, password);
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  const banner = page.getByText('Add a passkey or turn on an authenticator app');
  await expect(banner).toBeVisible();

  // Add a passkey (the virtual authenticator answers the browser prompt).
  await page.getByLabel('Passkey name').fill('Work laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
  await expect(page.getByTestId('passkeys')).toContainText('Work laptop');
  await expect(banner).toBeHidden(); // a passkey satisfies the MFA requirement

  // The page passes WCAG 2.2 AA checks with the passkeys section filled in.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Sign out, then sign in with the passkey alone: no email, no password.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/en/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expectSignedIn(page, email);
  // Staff land on the admin dashboard, not on the personal home page.
  await expect(page).toHaveURL(/\/en\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The passkey now shows a last-used date.
  await page.goto('/en/account/security');
  await expect(page.getByTestId('passkeys')).toContainText('Last used');
});

test('the passkey sign-in works in Hebrew and renames in place', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const email = uniqueEmail('passkey-he');
  const password = createAdmin(email);

  await signIn(page, 'en', email, password);
  // Wait for the sign-in to land (it sets the refresh cookie) before loading another page.
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await page.goto('/he/account/security');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'הוספת מפתח גישה' }).click();
  await expect(page.getByText('מפתח הגישה נוסף.')).toBeVisible();

  await page.getByRole('button', { name: 'שינוי שם' }).click();
  await page.getByTestId('passkeys').getByLabel('שם למפתח').fill('טלפון');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByTestId('passkeys')).toContainText('טלפון');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: /תפריט החשבון/ }).click();
  await page.getByRole('button', { name: 'יציאה' }).click();
  await page.goto('/he/login');
  await page.getByRole('button', { name: 'כניסה עם מפתח גישה' }).click();
  await expectSignedIn(page, email);
});
