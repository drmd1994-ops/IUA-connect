import { expect, test } from '@playwright/test';
import {
  NEW_PASSWORD,
  PASSWORD,
  expectSignedIn,
  linkFromOutbox,
  signIn,
  totp,
  uniqueEmail,
} from './helpers';

/**
 * A member's first day, in Hebrew: sign up → verify email → sign in → turn on two-step
 * verification → sign out → sign in with a code. Then a forgotten password, in English.
 */
test.describe.configure({ mode: 'serial' });

test('sign up, verify, sign in, enable MFA and sign in with a code (Hebrew)', async ({ page }) => {
  const email = uniqueEmail('member');

  await page.goto('/he/register');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('דוא״ל', { exact: true }).fill(email);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.getByRole('heading', { name: 'נא לבדוק את תיבת הדוא״ל' })).toBeVisible();

  // The verification link from the (outbox) email.
  const verifyLink = await linkFromOutbox(email, 'verifyEmail');
  expect(verifyLink).toContain('/he/verify-email?token=');
  await page.goto(new URL(verifyLink).pathname + new URL(verifyLink).search);
  await expect(page.getByRole('heading', { name: 'הכתובת אומתה' })).toBeVisible();

  await signIn(page, 'he', email, PASSWORD);
  await expectSignedIn(page, email);

  // Turn on two-step verification from the account menu.
  await page.getByRole('button', { name: /תפריט החשבון/ }).click();
  await page.getByRole('link', { name: 'אבטחת החשבון' }).click();
  await expect(page.getByTestId('mfa-status')).toHaveText('כבוי');
  await page.getByRole('button', { name: 'הפעלת אימות דו־שלבי' }).click();
  await expect(page.getByRole('img', { name: 'קוד QR להגדרת אפליקציית האימות' })).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel('קוד אימות').fill(totp(secret));
  await page.getByRole('button', { name: 'אישור והפעלה' }).click();

  const codes = page.getByTestId('recovery-codes').getByRole('listitem');
  await expect(codes).toHaveCount(10);
  await page.getByRole('button', { name: 'שמרתי את הקודים' }).click();
  await expect(page.getByTestId('mfa-status')).toHaveText('מופעל');

  // Sign out, then sign in again: now a code is required.
  await page.getByRole('button', { name: /תפריט החשבון/ }).click();
  await page.getByRole('button', { name: 'יציאה' }).click();
  await expect(
    page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'כניסה' }),
  ).toBeVisible();

  await signIn(page, 'he', email, PASSWORD);
  await expect(page.getByRole('heading', { name: 'אימות דו־שלבי' })).toBeVisible();
  // The enrolment code's time step is spent (replay protection): use the next one.
  await page.getByLabel('קוד אימות').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'אישור' }).click();
  await expectSignedIn(page, email);

  // The session survives a reload (refresh cookie → new in-memory access token).
  await page.reload();
  await expectSignedIn(page, email);
});

test('reset a forgotten password (English)', async ({ page }) => {
  const email = uniqueEmail('reset');
  await page.goto('/en/register');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const verify = new URL(await linkFromOutbox(email, 'verifyEmail'));
  await page.goto(verify.pathname + verify.search);
  await expect(page.getByRole('heading', { name: 'Your address is verified' })).toBeVisible();

  await page.goto('/en/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('If an account exists for this address')).toBeVisible();

  const reset = new URL(await linkFromOutbox(email, 'passwordReset'));
  await page.goto(reset.pathname + reset.search);
  // A breached password is refused with a clear, field-level message.
  await page.getByLabel('New password').fill('000123456789');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('This password appears in lists of leaked passwords')).toBeVisible();
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();

  await signIn(page, 'en', email, PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'The email or password is incorrect.',
  );
  await signIn(page, 'en', email, NEW_PASSWORD);
  await expectSignedIn(page, email);
});
