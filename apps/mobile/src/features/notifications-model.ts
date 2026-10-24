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
  if (path === '/education/exam/mock') return '/mock-exam';
  const mock = /^\/education\/exam\/mock\/([^/]+)$/.exec(path);
  if (mock) return `/mock-exam/${mock[1]}`;
  // Chat (M18b): the lists, and a conversation, a group or a room.
  if (path === '/chat') return '/chat';
  if (path === '/chat/rooms' || path === '/chat/rooms/browse') return '/chat-rooms';
  if (path === '/chat/invitations') return '/chat-invitations';
  const thread = /^\/chat\/(?:(groups|rooms)\/)?([^/]+)$/.exec(path);
  if (thread) {
    const kind = thread[1] === 'groups' ? 'group' : thread[1] === 'rooms' ? 'room' : 'direct';
    return `/thread/${kind}/${thread[2]}`;
  }
  // Jobs and mentorship (M28): the app has the same addresses.
  if (
    [
      '/positions',
      '/positions/saved',
      '/mentorship',
      '/mentorship/requests',
      '/mentorship/settings',
    ].includes(path)
  ) {
    return path;
  }
  // Communities (M25): the feed and saved posts open the list.
  if (['/communities', '/communities/following', '/communities/saved'].includes(path)) {
    return '/communities';
  }
  const community = /^\/communities\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (community) {
    return community[2]
      ? `/communities/${community[1]}/${community[2]}`
      : `/communities/${community[1]}`;
  }
  // Research (M27): the app has the same addresses.
  if (['/research', '/research/mine', '/research/requests', '/research/new'].includes(path)) {
    return path;
  }
  const project = /^\/research\/([^/]+)$/.exec(path);
  if (project) return `/research/${project[1]}`;
  // The journal club (M31): the list and an entry.
  if (path === '/journal-club') return path;
  const entry = /^\/journal-club\/([^/]+)$/.exec(path);
  if (entry) return `/journal-club/${entry[1]}`;
  // Cases (M26): the list, my cases and a case. Reviewing is on the site.
  if (['/cases', '/cases/mine', '/cases/new'].includes(path)) return path;
  const clinicalCase = /^\/cases\/([^/]+)$/.exec(path);
  if (clinicalCase && clinicalCase[1] !== 'review') return `/cases/${clinicalCase[1]}`;
  const position = /^\/positions\/([^/]+)$/.exec(path);
  if (position) return `/positions/${position[1]}`;
  const news = /^\/news\/([^/]+)$/.exec(path);
  if (news) return `/news/${news[1]}`;
  const event = /^\/events\/([^/]+)(?:\/check-in)?$/.exec(path);
  if (event) return `/events/${event[1]}`;
  const item = /^\/(education|guidelines|members|calculators)\/([^/]+)$/.exec(path);
  if (item) return `/${item[1]}/${item[2]}`;
  const message = /^\/account\/notifications\/messages\/([^/]+)$/.exec(path);
  if (message) return `/broadcast/${message[1]}`;
  if (
    ['/news', '/events', '/education', '/guidelines', '/members', '/calculators'].includes(path)
  ) {
    return path;
  }
  if (path === '/account/exam-results') return '/exam-results';
  if (path === '/account/profile') return '/profile';
  if (path === '/account/membership') return '/membership';
  if (path === '/account/membership/card') return '/card';
  if (path === '/account/security') return '/security';
  if (path === '/account/schedule') return '/events/schedule';
  if (path === '/account/notifications') return '/notifications';
  if (path === '/account/applications') return '/applications';
  if (path === '/account/verification') return '/verification';
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
