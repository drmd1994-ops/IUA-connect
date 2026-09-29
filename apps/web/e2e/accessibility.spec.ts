import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Automated WCAG 2.2 AA checks (axe) on every public page, in both languages. Automated checks
 * find roughly a third of accessibility problems; the manual NVDA pass is in M9.
 */
const PAGES = [
  '',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/account/security',
];

for (const locale of ['he', 'en'] as const) {
  for (const page of PAGES) {
    test(`no WCAG 2.2 AA violations on /${locale}${page}`, async ({ page: browserPage }) => {
      await browserPage.goto(`/${locale}${page}`);
      await expect(browserPage.locator('html')).toHaveAttribute('lang', locale);
      await expect(browserPage.locator('html')).toHaveAttribute(
        'dir',
        locale === 'he' ? 'rtl' : 'ltr',
      );
      await browserPage.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page: browserPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
}
