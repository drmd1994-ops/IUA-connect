import { appRoute } from './notifications-model';

/**
 * Email links that open the app (M18b plan §2.5). Android hands the app a link to the site
 * ("https://<site>/he/news/…"); here it becomes the screen it points to. A link that confirms an
 * email or sets a new password carries a one-time token, used the same way as on the site.
 */
export type LinkTarget =
  | { kind: 'screen'; route: string }
  | { kind: 'verifyEmail'; token: string }
  | { kind: 'resetPassword'; token: string }
  | { kind: 'guestEntry'; slug: string; code: string };

const LOCALE = /^\/(he|en)(?=\/|$)/;

/**
 * Where a link leads in the app, or null when it is not one of the site's links (the app's own
 * "medconnect://" addresses and the like are left to the router). `site` is the site's address.
 */
export function linkTarget(link: string, site: string): LinkTarget | null {
  let url: URL;
  try {
    url = new URL(link, site);
  } catch {
    return null;
  }
  if (url.origin !== new URL(site).origin) return null;
  const locale = LOCALE.exec(url.pathname);
  if (!locale) return null;
  const path = url.pathname.slice(locale[0].length) || '/';
  const token = url.searchParams.get('token');
  if (path === '/verify-email') return token ? { kind: 'verifyEmail', token } : null;
  if (path === '/reset-password') return token ? { kind: 'resetPassword', token } : null;
  const join = /^\/events\/([^/]+)\/join\/?$/.exec(path);
  const code = url.searchParams.get('code');
  if (join && code) {
    try {
      return { kind: 'guestEntry', slug: decodeURIComponent(join[1] ?? ''), code };
    } catch {
      return null;
    }
  }
  // A site link the app has no screen for opens the app's home.
  return { kind: 'screen', route: appRoute(path) ?? '/' };
}

/**
 * The link that opened the app, kept until it can be shown: a screen waits for the sign-in, a
 * token is used by the sign-in screens. One at a time; a newer link replaces it.
 */
let waiting: LinkTarget | null = null;
const listeners = new Set<() => void>();

export const pendingLink = {
  get: (): LinkTarget | null => waiting,
  set(target: LinkTarget | null) {
    waiting = target;
    for (const listener of listeners) listener();
  },
  /** Takes the link away, so it is shown once. */
  take(): LinkTarget | null {
    const target = waiting;
    if (target) pendingLink.set(null);
    return target;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};
