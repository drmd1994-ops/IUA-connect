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
  // M2 (signed-out views; the signed-in views are checked in membership.spec.ts)
  '/account/profile',
  '/account/membership',
  '/account/membership/card',
  '/account/applications',
  '/admin/members',
  '/card/verify',
  // M3 (the signed-in and filled views are checked in content.spec.ts)
  '/news',
  '/guidelines',
  '/admin/news',
  '/admin/guidelines',
  // M5 (the signed-in views are checked in events.spec.ts)
  '/events',
  '/account/schedule',
  '/admin/events',
  // M6 (the signed-in and filled views are checked in education.spec.ts)
  '/education',
  '/education/exam',
  '/account/exam-results',
  '/admin/education',
  '/admin/education/questions',
  // M7 (the signed-in and filled views are checked in notifications.spec.ts)
  '/search',
  '/members',
  '/account/notifications',
  '/account/notifications/preferences',
  '/notifications/unsubscribe',
  '/admin/broadcasts',
  // M8 (the signed-in views are checked in admin-portal.spec.ts)
  '/admin/users',
  '/admin/users/roles',
  '/admin/audit',
  '/admin/settings',
  // M9
  '/accessibility',
  // M16 (the signed-in views are checked in organisations.spec.ts)
  '/organisations',
  '/organisations/demo-urological-society',
  '/organisations/demo-urological-society/news',
  '/organisations/demo-urological-society/events',
  '/organisations/demo-urological-society/membership',
  // M17
  '/about',
  '/account/verification',
  '/admin/verifications',
  // M30 (a calculator with its result is checked in calculators.spec.ts)
  '/calculators',
  '/calculators/ipss',
  '/calculators/egfr',
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
