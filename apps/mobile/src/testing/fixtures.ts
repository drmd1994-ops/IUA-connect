import type { components } from '@medconnect/api-client';
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
  mark: null,
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

/** A fictional research project and publication (M27). */
const projectSummary: Omit<S['ProjectListDto']['items'][number], 'excerpt'> = {
  id: 'rp-1',
  title: 'A sample registry of clinic waiting times',
  studyType: 'REGISTRY',
  status: 'RECRUITING',
  ethics: 'APPROVED',
  needs: ['CENTRES', 'STATISTICIAN'],
  subspecialties: [subspecialty],
  lead: { id: 'u-lead', firstName: 'Yonatan', lastName: 'Barak', mark: null, hospital },
  open: true,
  ended: false,
  stale: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const project: S['ProjectDto'] = {
  ...projectSummary,
  description: 'How long people wait for a first visit. A fictional sample project.',
  funding: null,
  contact: 'Write through the platform',
  mine: false,
  myRequest: null,
  groupId: null,
  members: 2,
  createdAt: '2026-09-01T10:00:00.000Z',
};
const publication: S['PublicationDto'] = {
  id: 'pub-1',
  title: 'A fictional review of clinic waiting times',
  authors: 'Fictional authors',
  journal: 'Sample Journal of Urology',
  year: 2024,
  doi: '10.0000/sample.1',
  pmid: null,
  url: null,
  topics: ['health services'],
  source: 'MANUAL',
  hidden: false,
};

/** A fictional case, made up for the tests (M26). */
const caseSummary: S['CaseListDto']['items'][number] = {
  id: 'c-1',
  title: 'A made-up case of flank pain',
  subspecialty,
  ageRange: 'FROM_40_TO_64',
  sex: 'MALE',
  question: 'Would you treat this conservatively first?',
  author: { id: 'u-yoav', firstName: 'Yoav', lastName: 'Sela', mark: 'RESIDENT' },
  status: 'PUBLISHED',
  publishedAt: '2026-10-20T10:00:00.000Z',
  pictures: 0,
  comments: 2,
};
const clinicalCase: S['CaseDto'] = {
  ...caseSummary,
  history: 'Two days of left flank pain, no fever. A made-up case.',
  examination: null,
  labs: null,
  imaging: 'A made-up finding on imaging.',
  pathology: null,
  management: null,
  fileIds: [],
  poll: {
    options: [
      { id: 'o-1', text: 'Watch and wait' },
      { id: 'o-2', text: 'Treat now' },
    ],
    open: true,
    mine: null,
    totals: null,
    total: 0,
  },
  discussion: { communitySlug: 'andrology', postId: 'po-1' },
  week: true,
  reviewNote: null,
  mine: false,
  canEdit: false,
  canReview: false,
  reports: [],
  createdAt: '2026-10-19T10:00:00.000Z',
};

/** A fictional journal club entry about a made-up article (M31). */
const journalEntrySummary: S['JournalClubListDto']['items'][number] = {
  id: 'jc-1',
  month: '2026-10',
  locale: 'en',
  articleTitle: 'A made-up study of simulator practice',
  articleAuthors: 'Fictional authors',
  journal: 'Sample Journal',
  year: 2026,
  doi: '10.0000/sample.3',
  pmid: null,
  subspecialty,
  excerpt: 'Residents who practised first scored higher at their first session.',
  archived: false,
};
const journalEntry: S['JournalClubEntryDto'] = {
  ...journalEntrySummary,
  summary: 'Residents who practised first scored higher at their first session. A sample.',
  summaryAuthor: { id: 'u-rana', firstName: 'Rana', lastName: 'Haddad', mark: null, hospital },
  commentary: 'The gap closed after five sessions.',
  commentaryAuthor: { id: 'u-lead', firstName: 'Yonatan', lastName: 'Barak', mark: null, hospital },
  keyPoints: ['A made-up study about training only'],
  publishedAt: '2026-10-18T10:00:00.000Z',
  poll: { open: true, mine: null, totals: null },
  discussion: { communitySlug: 'andrology', postId: 'po-1' },
};

/** A fictional position at the sample hospital (M28). */
const positionSummary: S['PositionListDto']['items'][number] = {
  id: 'p-1',
  kind: 'FELLOWSHIP',
  organisation: null,
  place: {
    hospital: { ...hospital, cityHe: 'עיר', cityEn: 'A city' },
    department: { id: 'd-1', nameHe: 'אורולוגיה', nameEn: 'Urology' },
    institutionName: null,
    city: null,
    country: 'IL',
  },
  audience: 'SPECIALISTS',
  subspecialties: [subspecialty],
  closesOn: '2026-12-01',
  titleHe: 'השתלמות לדוגמה',
  titleEn: 'A sample fellowship',
  publishedAt: '2026-10-20T10:00:00.000Z',
  saved: true,
};
const abroad = {
  hospital: null,
  department: null,
  institutionName: 'A made-up institute',
  city: 'Lyon',
  country: 'FR',
};
/** A fictional question in a community (M25), by the reader (the fixture's "me"). */
const postSummary: S['PostListDto']['items'][number] = {
  id: 'po-1',
  community: { id: 'cm-1', slug: 'andrology', nameHe: 'אנדרולוגיה', nameEn: 'Andrology' },
  kind: 'QUESTION',
  title: 'Rotation timetables',
  excerpt: 'How do other departments plan the rotation?',
  author: { id: ME, firstName: 'Noa', lastName: 'Bar-Lev', mark: null },
  removed: null,
  answered: false,
  locked: false,
  commentCount: 1,
  createdAt: '2026-10-21T09:00:00.000Z',
  activityAt: '2026-10-21T10:00:00.000Z',
  bookmarked: false,
};
/** A fictional mentor. */
const mentorPerson = {
  id: 'u-mentor',
  firstName: 'Hila',
  lastName: 'Shapira',
  mark: null,
  hospital,
  department: { id: 'd-1', nameHe: 'אורולוגיה', nameEn: 'Urology' },
};

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
  verifiedAs: 'PHYSICIAN',
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
  mark: 'RESIDENT' as const,
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
  'GET /api/v1/me/verification': {
    status: 'VERIFIED',
    verifiedAs: 'PHYSICIAN',
    verifiedUntil: '2028-10-14T10:00:00.000Z',
    byOrganisation: false,
    canAsk: false,
    latest: {
      id: 'v-1',
      kind: 'PHYSICIAN',
      state: 'APPROVED',
      licenceProvided: true,
      certificateProvided: false,
      school: null,
      expectedGraduation: null,
      documentHeld: false,
      note: null,
      createdAt: '2026-10-01T08:00:00.000Z',
      closedAt: '2026-10-02T08:00:00.000Z',
      decisions: [{ decision: 'APPROVE', reason: null, at: '2026-10-02T08:00:00.000Z' }],
    },
  } satisfies S['MyVerificationDto'],
  'GET /api/v1/medical-schools': {
    items: [{ id: 'sch-1', nameHe: 'אוניברסיטת תל אביב', nameEn: 'Tel Aviv University' }],
  } satisfies S['MedicalSchoolListDto'],
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
  'GET /api/v1/me/exam-progress': {
    answered: 6,
    correct: 2,
    percent: 33,
    topics: [
      {
        key: 'ENDOUROLOGY',
        nameHe: 'אנדואורולוגיה',
        nameEn: 'Endourology',
        answered: 6,
        correct: 2,
        percent: 33,
        weak: true,
        available: 12,
      },
      {
        key: 'ANDROLOGY',
        nameHe: 'אנדרולוגיה',
        nameEn: 'Andrology',
        answered: 0,
        correct: 0,
        percent: null,
        weak: false,
        available: 4,
      },
    ],
    weeks: [
      { start: '2026-10-11', answered: 0, correct: 0 },
      { start: '2026-10-18', answered: 6, correct: 2 },
    ],
  } satisfies S['ExamProgressDto'],
  'GET /api/v1/me/exam-bookmarks': {
    items: [
      {
        questionId: 'q-1',
        stem: 'A sample question?',
        subspecialty: null,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
  } satisfies S['ExamBookmarkListDto'],
  'GET /api/v1/me/exam-reports': {
    items: [
      {
        id: 'rep-1',
        questionId: 'q-1',
        stem: 'A sample question?',
        reason: 'UNCLEAR',
        text: 'Option 2 reads oddly.',
        status: 'DISMISSED',
        createdAt: '2026-10-20T10:00:00.000Z',
        handledAt: '2026-10-21T10:00:00.000Z',
        response: 'It is worded as the guideline words it.',
      },
    ],
  } satisfies S['MyExamReportListDto'],
  'GET /api/v1/me/mock-exams': {
    items: [
      {
        id: 'mx-2',
        status: 'FINISHED',
        startedAt: '2026-10-20T10:00:00.000Z',
        endsAt: '2026-10-20T10:15:00.000Z',
        finishedAt: '2026-10-20T10:12:00.000Z',
        total: 10,
        correct: 7,
      },
    ],
  } satisfies S['MockExamListDto'],
  'GET /api/v1/me/mock-exams/mx-1': {
    id: 'mx-1',
    status: 'RUNNING',
    startedAt: '2026-10-23T10:00:00.000Z',
    endsAt: '2026-10-23T10:03:00.000Z',
    now: '2026-10-23T10:01:00.000Z',
    finishedAt: null,
    total: 2,
    answered: 1,
    correct: null,
    questions: [1, 2].map((position) => ({
      position,
      questionId: `q-${position}`,
      stem: `Sample question ${position}?`,
      options: [1, 2].map((option) => ({
        position: option,
        text: `Option ${option}`,
        correct: null,
        explanation: null,
      })),
      chosenPosition: position === 1 ? 2 : null,
      correctPosition: null,
      summary: null,
      references: [],
      reviewer: null,
    })),
  } satisfies S['MockExamDto'],
  'GET /api/v1/me/mock-exams/mx-2': {
    id: 'mx-2',
    status: 'FINISHED',
    startedAt: '2026-10-20T10:00:00.000Z',
    endsAt: '2026-10-20T10:03:00.000Z',
    now: '2026-10-23T10:01:00.000Z',
    finishedAt: '2026-10-20T10:02:00.000Z',
    total: 2,
    answered: 1,
    correct: 1,
    questions: [1, 2].map((position) => ({
      position,
      questionId: `q-${position}`,
      stem: `Sample question ${position}?`,
      options: [1, 2].map((option) => ({
        position: option,
        text: `Option ${option}`,
        correct: option === 1,
        explanation: option === 1 ? 'Why it is right.' : 'Why it is wrong.',
      })),
      chosenPosition: position === 1 ? 1 : null,
      correctPosition: 1,
      summary: 'A short summary.',
      references: [{ title: 'A made-up guideline, 2025', url: 'https://example.test/guide' }],
      reviewer: { nameHe: 'ד״ר בדויה', nameEn: 'Dr. Fictional', at: '2026-10-19T10:00:00.000Z' },
    })),
  } satisfies S['MockExamDto'],
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
      difficulty: 'MEDIUM',
      subspecialty: null,
      bookmarked: false,
      locale: 'en',
    },
    remaining: 3,
    leftOutRecentlyRight: 1,
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
  // Jobs, fellowships and mentorship (M28).
  'GET /api/v1/positions': {
    items: [positionSummary, { ...positionSummary, id: 'p-2', place: abroad, saved: false }],
    page: 1,
    pageSize: 10,
    total: 2,
    countries: ['FR', 'IL'],
  } satisfies S['PositionListDto'],
  'GET /api/v1/positions/saved': { items: [positionSummary] } satisfies S['SavedPositionListDto'],
  'GET /api/v1/positions/*': {
    ...positionSummary,
    translations: {
      he: { title: 'השתלמות לדוגמה', body: '**משרה לדוגמה, לא הצעה אמיתית.**\n\nשנה אחת.' },
      en: {
        title: 'A sample fellowship',
        body: '**Sample position, not a real offer.**\n\nOne year.',
      },
    },
    applyUrl: 'https://careers.example.test/apply',
    applyEmail: 'careers@example.test',
    closed: false,
  } satisfies S['PositionDto'],
  'PUT /api/v1/positions/*': {},
  'DELETE /api/v1/positions/*': {},
  'GET /api/v1/mentorship/mentors': {
    items: [
      {
        person: mentorPerson,
        subspecialties: [subspecialty],
        academicInterests: 'Bladder cancer research.',
        careerInterests: 'Choosing a fellowship.',
        availability: 'One call a month',
        languages: ['he', 'en'],
        taking: true,
        mine: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
  } satisfies S['MentorListDto'],
  'GET /api/v1/mentorship/requests': {
    items: [
      {
        id: 'ms-1',
        role: 'mentor',
        other: {
          id: 'u-yoav',
          firstName: 'Yoav',
          lastName: 'Sela',
          mark: 'RESIDENT',
          hospital,
          department: null,
        },
        state: 'PENDING',
        message: 'I would like advice on research.',
        createdAt: '2026-10-20T10:00:00.000Z',
        answeredAt: null,
        closedAt: null,
        conversationId: null,
      },
      {
        id: 'ms-2',
        role: 'mentee',
        other: mentorPerson,
        state: 'ACCEPTED',
        message: 'Could you mentor me this year?',
        createdAt: '2026-10-10T10:00:00.000Z',
        answeredAt: '2026-10-11T10:00:00.000Z',
        closedAt: null,
        conversationId: 'c-1',
      },
    ],
  } satisfies S['MentorshipListDto'],
  'GET /api/v1/mentorship/settings': {
    eligible: true,
    settings: {
      open: true,
      subspecialtyIds: ['sub-1'],
      academicInterests: 'Bladder cancer research.',
      careerInterests: 'Choosing a fellowship.',
      availability: 'One call a month',
      languages: ['he', 'en'],
      capacity: 2,
    },
    active: 1,
  } satisfies S['MentorSettingsDto'],
  // Communities (M25).
  'GET /api/v1/communities': {
    items: [
      {
        id: 'cm-1',
        slug: 'andrology',
        nameHe: 'אנדרולוגיה',
        nameEn: 'Andrology',
        descriptionHe: null,
        descriptionEn: null,
        subspecialty: null,
        postCount: 2,
        following: true,
        moderating: false,
      },
    ],
  } satisfies S['CommunityListDto'],
  'GET /api/v1/communities/feed': { items: [postSummary], page: 1, pageSize: 20, total: 1 },
  'GET /api/v1/communities/bookmarks': { items: [], page: 1, pageSize: 20, total: 0 },
  'GET /api/v1/communities/andrology': {
    id: 'cm-1',
    slug: 'andrology',
    nameHe: 'אנדרולוגיה',
    nameEn: 'Andrology',
    descriptionHe: null,
    descriptionEn: null,
    subspecialty: null,
    postCount: 2,
    following: true,
    moderators: [{ id: 'u-noa', firstName: 'Noa', lastName: 'Bar-Lev', mark: null }],
    canWrite: true,
    canModerate: false,
    banned: null,
    archived: false,
  } satisfies S['CommunityDto'],
  // Case discussions (M26).
  'GET /api/v1/cases': {
    items: [caseSummary, { ...caseSummary, id: 'c-2', title: 'Another made-up case' }],
    week: caseSummary,
    reviewer: false,
    page: 1,
    pageSize: 12,
    total: 2,
  } satisfies S['CaseListDto'],
  'GET /api/v1/cases/mine': {
    items: [
      {
        ...caseSummary,
        id: 'c-3',
        title: 'My made-up case',
        status: 'RETURNED',
        reviewNote: 'Please remove the exact age.',
      },
    ],
  } satisfies S['MyCasesDto'],
  'GET /api/v1/cases/*': clinicalCase,
  'PUT /api/v1/cases/*': {
    ...clinicalCase.poll!,
    mine: 'o-1',
    totals: { 'o-1': 3, 'o-2': 1 },
    total: 4,
  } satisfies S['CasePollDto'],
  'POST /api/v1/cases/*': {},
  // The journal club (M31).
  'GET /api/v1/journal-club': {
    items: [
      journalEntrySummary,
      { ...journalEntrySummary, id: 'jc-2', month: '2026-09', archived: true },
    ],
    current: journalEntrySummary,
    page: 1,
    pageSize: 12,
    total: 2,
  } satisfies S['JournalClubListDto'],
  'GET /api/v1/journal-club/*': journalEntry,
  'PUT /api/v1/journal-club/*': {
    open: true,
    mine: 'YES',
    totals: { YES: 3, PERHAPS: 1, NO: 0, total: 4 },
  } satisfies S['JournalClubPollDto'],
  // Research projects and publications (M27).
  'GET /api/v1/research/projects': {
    items: [{ ...projectSummary, excerpt: 'How long people wait for a first visit.' }],
    page: 1,
    pageSize: 20,
    total: 1,
  } satisfies S['ProjectListDto'],
  'GET /api/v1/research/projects/*': project,
  'POST /api/v1/research/projects/*': {},
  'GET /api/v1/research/requests': {
    items: [
      {
        id: 'rr-1',
        role: 'lead',
        project: { id: 'rp-1', title: projectSummary.title },
        other: {
          id: 'u-yoav',
          firstName: 'Yoav',
          lastName: 'Sela',
          mark: 'RESIDENT',
          hospital,
        },
        state: 'PENDING',
        message: 'I would like to take part.',
        createdAt: '2026-10-20T10:00:00.000Z',
        answeredAt: null,
      },
      {
        id: 'rr-2',
        role: 'asker',
        project: { id: 'rp-2', title: 'Another sample study' },
        other: projectSummary.lead,
        state: 'ACCEPTED',
        message: 'I can help with the analysis.',
        createdAt: '2026-10-10T10:00:00.000Z',
        answeredAt: '2026-10-11T10:00:00.000Z',
      },
    ],
  } satisfies S['ResearchRequestListDto'],
  'POST /api/v1/research/requests/*': {},
  'GET /api/v1/me/publications': { items: [publication] } satisfies S['PublicationListDto'],
  'GET /api/v1/me/publications/orcid': {
    source: 'ORCID',
    items: [
      {
        title: publication.title,
        authors: publication.authors,
        journal: publication.journal,
        year: publication.year,
        doi: publication.doi,
        pmid: null,
        url: null,
        saved: true,
      },
      {
        title: 'A second sample paper',
        authors: 'Fictional authors',
        journal: null,
        year: 2022,
        doi: '10.0000/sample.2',
        pmid: null,
        url: null,
        saved: false,
      },
    ],
  } satisfies S['PublicationDraftListDto'],
  'GET /api/v1/members/u-dana/publications': {
    items: [publication],
  } satisfies S['PublicationListDto'],
  'GET /api/v1/communities/andrology/posts': {
    items: [postSummary],
    page: 1,
    pageSize: 20,
    total: 1,
  } satisfies S['PostListDto'],
  'GET /api/v1/posts/*': {
    ...postSummary,
    body: 'How do other departments plan the rotation?',
    removedReason: null,
    edited: false,
    files: [],
    reactions: [{ reaction: 'thanks', count: 1, mine: false }],
    comments: [
      {
        id: 'pc-1',
        parentId: null,
        author: { id: 'u-avi', firstName: 'Avi', lastName: 'Karmeli', mark: null },
        body: 'Two blocks of six weeks.',
        removed: null,
        removedReason: null,
        edited: false,
        createdAt: '2026-10-21T10:00:00.000Z',
        reactions: [],
        isAnswer: false,
        canEdit: false,
      },
    ],
    bookmarked: false,
    following: true,
    canEdit: true,
    canComment: true,
    canModerate: false,
  } satisfies S['PostDto'],
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
  'POST /api/v1/auth/verify-email': { status: 'ok' },
  'GET /api/v1/auth/passkeys': {
    passkeys: [
      {
        id: '0199f0aa-0000-7000-8000-00000000a001',
        name: 'Pixel',
        createdAt: '2026-10-05T08:00:00.000Z',
        lastUsedAt: null,
        synced: true,
      },
    ],
  } satisfies S['PasskeyListDto'],
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
        other: {
          id: null,
          firstName: null,
          lastName: null,
          photoFileId: null,
          listed: false,
          mark: null,
        },
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
