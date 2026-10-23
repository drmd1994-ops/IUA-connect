import { WEB_URL } from '@/config';
import { linkTarget, pendingLink } from '@/features/app-links';

/**
 * Every address the phone opens the app with passes here first (expo-router). A link to the site
 * (M18b) is kept for the app's frame, which shows it once it can: after the sign-in, or at once.
 * The app starts from its home meanwhile. Anything else goes on unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const target = linkTarget(path, WEB_URL);
  if (!target) return path;
  pendingLink.set(target);
  return '/';
}
