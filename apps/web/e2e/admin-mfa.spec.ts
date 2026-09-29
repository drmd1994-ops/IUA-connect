import { expect, test } from '@playwright/test';
import { createAdmin, expectSignedIn, signIn, totp, uniqueEmail } from './helpers';

/** An administrator created with `pnpm admin:create` must enrol in MFA at first sign-in. */
test('a new administrator is sent to two-step verification setup', async ({ page }) => {
  const email = uniqueEmail('admin');
  const password = createAdmin(email);

  await signIn(page, 'en', email, password);
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  const banner = page.getByText('Add a passkey or turn on an authenticator app');
  await expect(banner).toBeVisible();

  await page.getByRole('button', { name: 'Turn on two-step verification' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await page.getByRole('button', { name: 'I’ve saved these codes' }).click();

  await expect(banner).toBeHidden();
  await expect(page.getByTestId('mfa-status')).toHaveText('On');
  // Administrators can't turn MFA off.
  await expect(
    page.getByText('Your role requires two-step verification, so it can’t be turned off.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn off two-step verification' })).toHaveCount(0);
  await expectSignedIn(page, email);
});
