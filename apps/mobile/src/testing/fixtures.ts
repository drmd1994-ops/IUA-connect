import type { components } from '@iua/api-client';
import { type Answer } from './world';

/**
 * What the pretend server answers, shaped as the real API's answers are (the types come from
 * the API's own description, so a change there fails the type check here). Fictional people.
 */

type S = components['schemas'];

const person = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  photoFileId: null,
  listed: true,
});
export const ME = 'me-1';
export const dana = person('u-dana', 'Dana', 'Levi');
const noa = person(ME, 'Noa', 'Bar-Lev');
const category = {
  id: 'cat-1',
  key: 'association',
  nameHe: 'הודעות האיגוד',
  nameEn: 'Association updates',
};
const subspecialty = {
  id: 'sub-1',
  key: 'oncology',
  nameHe: 'אורולוגיה אונקולוגית',
  nameEn: 'Urologic oncology',
};
/** A fictional organisation with a section on the platform. */
const organisation = {
  id: 'o-1',
  slug: 'sample-society',
  nameHe: 'אגודה לדוגמה',
  nameEn: 'A sample society',
};
const hospital = { id: 'h-1', nameHe: 'בית חולים לדוגמה', nameEn: 'Sample Hospital' };

export const me: S['MeDto'] = {
  id: ME,
  email: 'member.full@demo.test',
  emailVerified: true,
  locale: 'he',
  roles: [],
  permissions: [],
  platformPermissions: [],
  organisations: [],
  verified: true,
  mfaEnabled: false,
  mfaEnrollmentRequired: false,
  session: { id: 's-1', mfa: false },
};

export const membership: S['MyMembershipDto'] = {
  membership: {
    id: 'm-1',
    organisation,
    type: { id: 't-1', key: 'full', nameHe: 'חבר/ה מן המניין', nameEn: 'Full member' },
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2026-12-31',
    paymentStatus: 'PAID',
  },
  history: [
    {
      event: 'CREATED',
      fromStatus: null,
      toStatus: 'ACTIVE',
      details: null,
      reason: null,
      at: '2025-01-01T08:00:00.000Z',
    },
    {
      event: 'RENEWED',
      fromStatus: 'ACTIVE',
      toStatus: 'ACTIVE',
      details: null,
      reason: 'Paid for 2026',
      at: '2026-01-02T08:00:00.000Z',
    },
  ],
};

const visibility = Object.fromEntries(
  [
    'NAME',
    'NAME_HE',
    'NAME_EN',
    'TITLE',
    'POSITION',
    'INSTITUTION',
    'SUBSPECIALTIES',
    'BIO',
    'RESEARCH_INTERESTS',
    'ORCID',
    'LANGUAGES',
    'CONTACT_EMAIL',
    'CONTACT_PHONE',
    'PHOTO',
  ].map((key) => [key, 'MEMBERS']),
) as S['ProfileDto']['visibility'];

export const profile: S['ProfileDto'] = {
  firstName: 'Noa',
  lastName: 'Bar-Lev',
  nameHe: 'נועה בר-לב',
  nameEn: 'Noa Bar-Lev',
  title: 'Dr.',
  position: 'Senior physician',
  hospitalId: hospital.id,
  departmentId: 'd-1',
  subspecialtyIds: [subspecialty.id],
  bio: 'A fictional member.',
  researchInterests: null,
  orcid: null,
  languages: ['he', 'en'],
  contactEmail: null,
  contactPhone: null,
  photoFileId: null,
  visibility,
};

const newsItem = {
  slug: 'annual-meeting',
  title: 'The annual meeting opens for registration',
  summary: 'A short summary.',
  category: { key: category.key, nameHe: category.nameHe, nameEn: category.nameEn },
  tags: [],
  date: '2026-10-01T09:00:00.000Z',
  featuredImageFileId: 'f-1',
  accessTier: 'MEMBERS' as const,
  sourceUrl: null,
  organisation,
  locale: 'en' as const,
  fallback: false,
};
export const article: S['PublicNewsDto'] = {
  ...newsItem,
  body: '## Details\n\nA paragraph with **bold** text and a [link](https://example.test/more).\n\n- one\n- two',
  author: 'The editorial desk',
  archived: false,
  attachments: [
    { id: 'f-2', originalName: 'programme.pdf', mimeType: 'application/pdf', sizeBytes: 250000 },
  ],
  references: [{ title: 'A reference', url: 'https://example.test/ref' }],
};

const eventItem = {
  slug: 'workshop',
  organisation,
  title: 'Workshop with limited places',
  summary: 'One place only.',
  category: { key: 'course', nameHe: 'קורסים', nameEn: 'Courses' },
  startAt: '2026-10-19T06:00:00.000Z',
  endAt: '2026-10-19T09:00:00.000Z',
  timezone: 'Asia/Jerusalem',
  locationName: 'Sample Hall',
  imageFileId: null,
  cancelled: false,
  registrationMode: 'INTERNAL' as const,
  cmeAvailable: true,
  accessTier: 'PUBLIC' as const,
  locale: 'en' as const,
  fallback: false,
};
export const event: S['PublicEventDto'] = {
  ...eventItem,
  description: 'A description of the workshop.',
  address: '1 Sample Street',
  lat: 32.08,
  lng: 34.78,
  organizer: 'The association',
  registrationUrl: null,
  capacity: 10,
  placesLeft: 4,
  registrationOpen: true,
  cancelReason: null,
  sourceUrl: null,
};
export const sessions: S['PublicSessionListDto'] = {
  items: [
    {
      id: 'ses-1',
      title: 'Opening session',
      description: 'What the day holds.',
      startAt: '2026-10-19T06:00:00.000Z',
      endAt: '2026-10-19T07:00:00.000Z',
      room: 'A',
      locale: 'en',
      speakers: [
        {
          id: 'sp-1',
          name: 'Dana Levi',
          title: 'Dr.',
          affiliation: 'Sample Hospital',
          bio: null,
          photoFileId: null,
        },
      ],
      materials: [
        { id: 'f-3', originalName: 'slides.pdf', mimeType: 'application/pdf', sizeBytes: 1200000 },
      ],
    },
  ],
};
export const notRegistered: S['MyRegistrationDto'] = {
  status: 'NONE',
  waitingPosition: null,
  sessionIds: [],
};
export const registered: S['MyRegistrationDto'] = {
  status: 'REGISTERED',
  waitingPosition: null,
  sessionIds: [],
};

export function message(
  seq: number,
  mine: boolean,
  body: string,
  extra: Partial<S['MessageDto']> = {},
): S['MessageDto'] {
  return {
    id: `msg-${seq}`,
    conversationId: 'c-1',
    seq,
    senderId: mine ? ME : dana.id,
    sender: mine ? noa : dana,
    mine,
    body,
    deleted: false,
    removedByModerator: false,
    announcement: false,
    senderBlocked: false,
    mentions: [],
    forwarded: false,
    attachments: [],
    reactions: [],
    editedAt: null,
    createdAt: `2026-10-06T08:0${seq}:00.000Z`,
    canEdit: mine,
    replyTo: null,
    ...extra,
  };
}
export const messages = {
  items: [
    message(1, false, 'Good morning'),
    message(2, true, 'Good morning to you', {
      reactions: [{ reaction: 'like', count: 1, mine: false }],
    }),
    message(3, false, 'See https://example.test/paper', {
      attachments: [
        {
          id: 'f-4',
          kind: 'DOCUMENT',
          mimeType: 'application/pdf',
          name: 'paper.pdf',
          sizeBytes: 90000,
          width: null,
          height: null,
        },
      ],
    }),
  ],
  hasMore: false,
};

const listed = {
  pinned: false,
  lastMessage: {
    id: 'msg-3',
    seq: 3,
    senderId: dana.id,
    body: 'See https://example.test/paper',
    deleted: false,
    files: 1,
    createdAt: '2026-10-06T08:03:00.000Z',
  },
  lastSeq: 3,
  lastMessageAt: '2026-10-06T08:03:00.000Z',
  unreadCount: 2,
  markedUnread: false,
  muted: false,
  mutedUntil: null,
  archived: false,
  myLastReadSeq: 1,
  otherDeliveredSeq: 2,
  otherReadSeq: 2,
};
export const conversation: S['ConversationDetailDto'] = {
  id: 'c-1',
  kind: 'DIRECT',
  other: dana,
  group: null,
  ...listed,
  sendState: 'none',
  blockedByMe: false,
};
export const group: S['GroupDto'] = {
  id: 'g-1',
  name: 'Journal club',
  memberCount: 3,
  createdAt: '2026-09-01T08:00:00.000Z',
  lastMessageAt: '2026-10-06T08:03:00.000Z',
  lastSeq: 3,
  myLastReadSeq: 3,
  role: 'ADMIN',
  unreadCount: 0,
  markedUnread: false,
  muted: false,
  mutedUntil: null,
  archived: false,
  pinned: true,
  sendState: 'none',
};
const roomListed = {
  id: 'r-1',
  organisation,
  nameHe: 'חדר כללי',
  nameEn: 'General room',
  descriptionHe: 'חדר לדוגמה',
  descriptionEn: 'A sample room',
  category: { id: 'rc-1', key: 'general', nameHe: 'כללי', nameEn: 'General' },
  pictureFileId: null,
  memberCount: 12,
  moderatorsOnly: false,
  locked: false,
  lockedUntil: null,
  archived: false,
  inviteOnly: false,
  pinned: false,
  createdAt: '2026-08-01T08:00:00.000Z',
  lastMessageAt: '2026-10-06T08:03:00.000Z',
  role: 'MODERATOR' as const,
  unreadCount: 1,
  markedUnread: false,
  muted: false,
  mutedUntil: null,
};
export const room: S['RoomDetailDto'] = {
  ...roomListed,
  lastSeq: 3,
  myLastReadSeq: 2,
  sendState: 'none',
  canModerate: true,
  banned: false,
  moderators: [noa],
};

const educationItem = {
  slug: 'stone-disease',
  type: 'ARTICLE' as const,
  title: 'An update on stone disease',
  author: 'Dana Levi',
  level: 'RESIDENT' as const,
  subspecialty: { key: subspecialty.key, nameHe: subspecialty.nameHe, nameEn: subspecialty.nameEn },
  durationMinutes: 20,
  cmePoints: 1,
  coverFileId: null,
  publishedAt: '2026-09-20T08:00:00.000Z',
  accessTier: 'MEMBERS' as const,
  locale: 'en' as const,
  fallback: false,
};
const guideline = {
  id: 'gl-1',
  title: 'Guideline on a sample topic',
  summary: 'The association’s summary.',
  sourceOrg: 'EAU',
  officialUrl: 'https://example.test/guideline',
  evidenceLevel: '1a',
  status: 'CURRENT' as const,
  subspecialty: { key: subspecialty.key, nameHe: subspecialty.nameHe, nameEn: subspecialty.nameEn },
  version: '2026',
  publishedOn: '2026-03-01',
  yearOnly: true,
  accessTier: 'PUBLIC' as const,
  locale: 'en' as const,
  fallback: false,
};
const directoryMember = {
  id: dana.id,
  firstName: 'Dana',
  lastName: 'Levi',
  nameHe: 'דנה לוי',
  nameEn: 'Dana Levi',
  title: 'Dr.',
  position: 'Resident',
  hospital,
  department: { id: 'd-1', nameHe: 'אורולוגיה', nameEn: 'Urology' },
  subspecialties: [subspecialty],
  photoFileId: null,
};

const page = <T>(items: T[]) => ({ items, page: 1, pageSize: 10, total: items.length });

/** Routes whose answer depends on what follows a fixed start of the address. */
const families: Record<string, Answer> = {
  'GET /api/v1/files/*': {
    url: '/api/v1/files/f/content?sig=x',
    expiresAt: '2026-10-06T09:05:00.000Z',
  },
  'GET /api/v1/news/*': article,
  'GET /api/v1/events/*': ({ path }) =>
    path.endsWith('/sessions') ? sessions : path.endsWith('/registration') ? notRegistered : event,
  'GET /api/v1/education/*': {
    ...educationItem,
    description: 'The text of the item.',
    archived: false,
    externalUrl: 'https://www.youtube.com/watch?v=sample',
    videoStatus: 'EXTERNAL',
    files: [],
    references: [],
    lessons: [],
  } satisfies S['PublicEducationDto'],
  'GET /api/v1/guidelines/*': {
    ...guideline,
    versions: [
      {
        id: 'v-1',
        version: '2024',
        publishedOn: '2024-03-01',
        yearOnly: true,
        url: 'https://example.test/2024',
        licenseNote: null,
      },
    ],
  } satisfies S['PublicGuidelineDto'],
  'GET /api/v1/members/*': {
    ...directoryMember,
    bio: 'A fictional resident.',
    researchInterests: null,
    orcid: null,
    languages: ['he'],
    contactEmail: null,
    contactPhone: null,
  } satisfies S['DirectoryMemberDto'],
  'GET /api/v1/hospitals/*': { items: [{ id: 'd-1', nameHe: 'אורולוגיה', nameEn: 'Urology' }] },
  'GET /api/v1/broadcasts/*': {
    id: 'b-1',
    organisation,
    title: 'A message to all members',
    paragraphs: ['First paragraph.', 'Second paragraph.'],
    locale: 'en',
    sentAt: '2026-10-05T10:00:00.000Z',
  } satisfies S['BroadcastMessageDto'],
  'GET /api/v1/chat/conversations/*': ({ path }) =>
    path.endsWith('/messages') ? messages : conversation,
  'GET /api/v1/chat/groups/*': ({ path }) =>
    path.endsWith('/messages')
      ? messages
      : path.endsWith('/members')
        ? {
            items: [
              { ...noa, role: 'ADMIN' },
              { ...dana, role: 'MEMBER' },
            ],
          }
        : path.endsWith('/invitations')
          ? { items: [] }
          : group,
  'GET /api/v1/chat/rooms/*': ({ path }) =>
    path.endsWith('/messages')
      ? messages
      : path.endsWith('/pins')
        ? { items: [{ message: messages.items[0] }] }
        : path.endsWith('/members')
          ? {
              items: [
                { ...noa, role: 'MODERATOR' },
                { ...dana, role: 'MEMBER' },
              ],
              total: 2,
              page: 1,
              pageSize: 50,
            }
          : path.endsWith('/bans') || path.endsWith('/invitations')
            ? { items: [] }
            : room,
  // Reading, typing: accepted and nothing to say.
  'POST /api/v1/chat/*': {},
};

/** Every address the app's screens ask at, with a small, plausible answer. */
export const everything: Record<string, Answer> = {
  ...families,
  'GET /api/v1/me': me,
  'GET /api/v1/me/membership': membership,
  'GET /api/v1/me/memberships': { items: [membership.membership!] } satisfies S['MyMembershipsDto'],
  'GET /api/v1/organisations': {
    items: [{ ...organisation, descriptionHe: 'אגודה בדויה, לצורך הדגמה.', descriptionEn: null }],
  } satisfies S['OrganisationListDto'],
  'GET /api/v1/me/membership/card-token': { token: 'card-token' },
  'GET /api/v1/me/profile': profile,
  'GET /api/v1/me/consents': {
    directory: { granted: true, version: '1', grantedAt: '2026-02-01T08:00:00.000Z' },
  },
  'GET /api/v1/me/schedule': {
    items: [
      {
        slug: eventItem.slug,
        title: eventItem.title,
        startAt: eventItem.startAt,
        endAt: eventItem.endAt,
        timezone: eventItem.timezone,
        locationName: eventItem.locationName,
        cancelled: false,
        status: 'REGISTERED',
        sessions: [
          {
            id: 'ses-1',
            title: 'Opening session',
            startAt: eventItem.startAt,
            endAt: '2026-10-19T07:00:00.000Z',
            room: 'A',
            overlaps: false,
          },
        ],
      },
    ],
  } satisfies S['MyScheduleDto'],
  'GET /api/v1/me/exam-results': {
    answered: 2,
    correct: 1,
    percent: 50,
    items: [
      {
        questionId: 'q-1',
        stem: 'A sample question?',
        firstCorrect: true,
        attempts: 1,
        lastAnsweredAt: '2026-10-05T10:00:00.000Z',
      },
    ],
  } satisfies S['ExamResultsDto'],
  'GET /api/v1/me/notification-preferences': {
    items: [
      { kind: 'ACCOUNT', app: true, email: true, locked: true },
      { kind: 'NEWS', app: true, email: false, locked: false },
    ],
  } satisfies S['NotificationPreferencesDto'],
  'GET /api/v1/me/chat-settings': {
    audience: 'LISTED',
    readReceipts: true,
    typing: true,
    invitesFrom: 'LISTED',
    showActivity: true,
  } satisfies S['ChatSettingsDto'],
  'GET /api/v1/notifications/unread-count': { unread: 2 },
  'GET /api/v1/notifications': {
    items: [
      {
        id: 'n-1',
        kind: 'NEWS',
        type: 'contentNews',
        params: { titleHe: 'ידיעה', titleEn: 'An item' },
        link: '/news/annual-meeting',
        readAt: null,
        createdAt: '2026-10-05T10:00:00.000Z',
      },
      {
        id: 'n-2',
        kind: 'ACCOUNT',
        type: 'membershipApproved',
        params: { typeName: 'Full member' },
        link: '/admin/somewhere',
        readAt: '2026-10-04T10:00:00.000Z',
        createdAt: '2026-10-03T10:00:00.000Z',
      },
    ],
    total: 2,
    unread: 1,
    page: 1,
    pageSize: 20,
  } satisfies S['NotificationListDto'],
  'GET /api/v1/news': page([newsItem]),
  'GET /api/v1/news/categories': { items: [{ ...category, sortOrder: 1, active: true }] },
  'GET /api/v1/events': page([eventItem]),
  'GET /api/v1/events/categories': {
    items: [
      {
        id: 'ec-1',
        key: 'course',
        nameHe: 'קורסים',
        nameEn: 'Courses',
        sortOrder: 1,
        active: true,
      },
    ],
  },
  'GET /api/v1/education': page([educationItem]),
  'GET /api/v1/exam-questions/next': {
    question: {
      id: 'q-1',
      stem: 'A sample question?',
      options: [
        { position: 1, text: 'First option' },
        { position: 2, text: 'Second option' },
      ],
      level: 'RESIDENT',
      subspecialty: null,
      locale: 'en',
    },
    remaining: 3,
  } satisfies S['NextQuestionDto'],
  'GET /api/v1/guidelines': page([guideline]),
  'GET /api/v1/members': page([directoryMember]),
  'GET /api/v1/search': {
    groups: [
      {
        type: 'news',
        total: 1,
        items: [
          {
            id: 'x-1',
            title: 'A found item',
            excerpt: 'An excerpt',
            link: '/news/annual-meeting',
            locale: 'en',
          },
        ],
      },
    ],
    page: 1,
    pageSize: 5,
  } satisfies S['SearchResultsDto'],
  'GET /api/v1/subspecialties': { items: [subspecialty] },
  'GET /api/v1/hospitals': { items: [{ ...hospital, cityHe: 'עיר', cityEn: 'A city' }] },
  'GET /api/v1/membership-types': {
    items: [
      {
        id: 't-1',
        organisation,
        key: 'full',
        nameHe: 'חבר/ה מן המניין',
        nameEn: 'Full member',
        identifier: 'MEDICAL_LICENCE',
        selfApply: true,
        directorApproval: true,
      },
    ],
  } satisfies S['MembershipTypeListDto'],
  'GET /api/v1/verification-requests/mine': {
    items: [
      {
        id: 'app-1',
        organisation,
        state: 'PENDING_DIRECTOR',
        type: { id: 't-1', key: 'full', nameHe: 'חבר/ה מן המניין', nameEn: 'Full member' },
        hospital,
        department: null,
        identifierProvided: true,
        createdAt: '2026-10-01T08:00:00.000Z',
        closedAt: null,
        decisions: [],
      },
    ],
  } satisfies S['ApplicationListDto'],
  'GET /api/v1/auth/mfa': {
    enabled: false,
    recoveryCodesRemaining: 0,
    requiredByRole: false,
    canDisable: true,
  } satisfies S['MfaStatusDto'],
  'GET /api/v1/auth/sessions': {
    sessions: [
      {
        id: 's-1',
        device: 'This phone',
        client: 'APP',
        ip: null,
        createdAt: '2026-10-05T08:00:00.000Z',
        lastSeenAt: '2026-10-06T08:00:00.000Z',
        expiresAt: '2026-11-05T08:00:00.000Z',
        current: true,
      },
      {
        id: 's-2',
        device: 'Chrome on Windows',
        client: 'WEB',
        ip: null,
        createdAt: '2026-10-04T08:00:00.000Z',
        lastSeenAt: '2026-10-05T08:00:00.000Z',
        expiresAt: '2026-11-04T08:00:00.000Z',
        current: false,
      },
    ],
  } satisfies S['SessionListDto'],
  'GET /api/v1/chat/unread-count': { conversations: 1, enabled: true },
  'GET /api/v1/chat/conversations': {
    items: [
      { id: 'c-1', kind: 'DIRECT', other: dana, group: null, ...listed },
      {
        id: 'g-1',
        kind: 'GROUP',
        other: { id: null, firstName: null, lastName: null, photoFileId: null, listed: false },
        group: { name: 'Journal club', memberCount: 3 },
        ...listed,
        unreadCount: 0,
        pinned: true,
      },
    ],
    nextCursor: null,
  } satisfies S['ConversationListDto'],
  'GET /api/v1/chat/rooms': {
    items: [roomListed, { ...roomListed, id: 'r-2', nameEn: 'Another room', role: 'NONE' }],
    nextCursor: null,
  } satisfies S['RoomListDto'],
  'GET /api/v1/chat/rooms/mine': {
    items: [roomListed],
    nextCursor: null,
  } satisfies S['RoomListDto'],
  'GET /api/v1/chat/room-categories': {
    items: [{ id: 'rc-1', key: 'general', nameHe: 'כללי', nameEn: 'General' }],
  },
  'GET /api/v1/chat/invitations': {
    items: [
      {
        id: 'inv-1',
        kind: 'GROUP',
        conversationId: 'g-2',
        name: 'Residents',
        nameEn: null,
        memberCount: 4,
        invitedBy: dana,
        members: [dana],
        createdAt: '2026-10-05T08:00:00.000Z',
        expiresAt: '2026-10-19T08:00:00.000Z',
      },
    ],
  } satisfies S['InvitationListDto'],
  'GET /api/v1/chat/blocks': {
    items: [{ user: dana, createdAt: '2026-10-01T08:00:00.000Z' }],
  } satisfies S['BlockListDto'],
  'GET /api/v1/chat/report-categories': {
    items: [{ id: 'rep-1', key: 'spam', nameHe: 'ספאם', nameEn: 'Spam' }],
  },
  'GET /api/v1/chat/activity': {
    items: [{ userId: dana.id, activity: 'online' }],
  } satisfies S['ActivityDto'],
  'GET /api/v1/chat/people': {
    items: [{ id: dana.id, firstName: 'Dana', lastName: 'Levi', title: 'Dr.', photoFileId: null }],
  } satisfies S['ChatPeopleDto'],
  'GET /api/v1/chat/invitable': { items: [dana] },
  'GET /api/v1/chat/search': { items: [] },
};
