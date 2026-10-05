/**
 * What the notices screen decides by itself: where a notice leads inside the app, and which of
 * its two titles is read.
 */

/**
 * A notice carries an address on the site ("/news/…"). Where the app has that screen, the app's
 * own address is answered; otherwise nothing, and the notice is only read.
 */
export function appRoute(link: string | null): string | null {
  if (!link) return null;
  const path = link.split(/[?#]/)[0] ?? '';
  // Before the items: exam practice lives under "/education" on the site, and is not an item.
  if (path === '/education/exam') return '/exam';
  const news = /^\/news\/([^/]+)$/.exec(path);
  if (news) return `/news/${news[1]}`;
  const event = /^\/events\/([^/]+)$/.exec(path);
  if (event) return `/events/${event[1]}`;
  const item = /^\/(education|guidelines|members)\/([^/]+)$/.exec(path);
  if (item) return `/${item[1]}/${item[2]}`;
  const message = /^\/account\/notifications\/messages\/([^/]+)$/.exec(path);
  if (message) return `/broadcast/${message[1]}`;
  if (['/news', '/events', '/education', '/guidelines', '/members'].includes(path)) return path;
  if (path === '/account/exam-results') return '/exam-results';
  if (path === '/account/profile') return '/profile';
  if (path === '/account/membership') return '/membership';
  if (path === '/account/security') return '/security';
  if (path === '/account/schedule') return '/events/schedule';
  return null;
}

/**
 * Notices about content carry the title in Hebrew and in English; the reader's language is used
 * when there is one, and the other otherwise.
 */
export function noticeValues(
  params: Record<string, unknown>,
  locale: string,
): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') values[key] = value;
  }
  const title =
    (locale === 'he' ? (values.titleHe ?? values.titleEn) : (values.titleEn ?? values.titleHe)) ??
    values.title ??
    '';
  return { ...values, title };
}

export interface Preference {
  kind: string;
  app: boolean;
  email: boolean;
  locked: boolean;
}

/** What is sent when the switches are saved: every kind the person may change. */
export function changeable(items: readonly Preference[]) {
  return items.filter((item) => !item.locked).map(({ kind, app, email }) => ({ kind, app, email }));
}
