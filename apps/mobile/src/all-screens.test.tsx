import { type ReactElement } from 'react';
import { ChatTab, BrowseRooms, Invitations, NewConversation, NewGroup } from '@/chat/lists';
import { ChatSettings } from '@/chat/settings';
import { ThreadScreen } from '@/chat/thread';
import {
  AccessibilityStatement,
  BroadcastMessage,
  MembershipScreen,
  ProfileScreen,
  SecurityScreen,
} from '@/features/account';
import { Directory, GuidelineView, GuidelinesList, MemberPage, Search } from '@/features/browse';
import { MembershipCard } from '@/features/card';
import { EducationItem, EducationList, ExamPractice, ExamResults } from '@/features/education';
import { EventList, EventPage, MySchedule } from '@/features/events';
import { Home } from '@/features/home';
import { MeScreen } from '@/features/me';
import { OrganisationScreen } from '@/features/organisation';
import { VerificationScreen } from '@/features/verification';
import { NewsArticle, NewsList } from '@/features/news';
import { NotificationSettings, Notifications } from '@/features/notifications';
import { ScanScreen } from '@/features/scan';
import { SignIn } from '@/features/sign-in';
import { Applications, ForgotPassword, Register } from '@/features/visitor';
import { allText, draw, expectSound } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { world } from '@/testing/world';

/**
 * Every screen of the app, drawn in both languages against a pretend server that answers each
 * of its requests. A screen passes when every text it shows exists and could be written, every
 * control has a name a screen reader can say, and it asked for nothing unforeseen.
 */

const nothing = () => undefined;
const screens: [name: string, screen: ReactElement, guest?: boolean][] = [
  ['sign-in', <SignIn key="s" onForgot={nothing} onRegister={nothing} onGuest={nothing} />],
  ['forgot password', <ForgotPassword key="s" onBack={nothing} />],
  ['open an account', <Register key="s" onBack={nothing} />],
  ['home', <Home key="s" />],
  ['home, for a visitor', <Home key="s" />, true],
  ['the membership card', <MembershipCard key="s" />],
  ['me', <MeScreen key="s" />],
  ['verification', <VerificationScreen key="s" />],
  ['an organisation’s section', <OrganisationScreen key="s" />],
  ['an organisation’s section, for a visitor', <OrganisationScreen key="s" />, true],
  ['news', <NewsList key="s" />],
  ['a news item', <NewsArticle key="s" slug="annual-meeting" />],
  ['events', <EventList key="s" />],
  ['an event', <EventPage key="s" slug="workshop" />],
  ['an event, for a visitor', <EventPage key="s" slug="workshop" />, true],
  ['my schedule', <MySchedule key="s" />],
  ['notifications', <Notifications key="s" />],
  ['notification settings', <NotificationSettings key="s" />],
  ['chat', <ChatTab key="s" />],
  ['a new conversation', <NewConversation key="s" />],
  ['a new group', <NewGroup key="s" />],
  ['browsing rooms', <BrowseRooms key="s" />],
  ['invitations', <Invitations key="s" />],
  ['chat settings', <ChatSettings key="s" />],
  ['a private conversation', <ThreadScreen key="s" kind="direct" id="c-1" />],
  ['a group', <ThreadScreen key="s" kind="group" id="g-1" />],
  ['a room', <ThreadScreen key="s" kind="room" id="r-1" />],
  ['education', <EducationList key="s" />],
  ['an education item', <EducationItem key="s" slug="stone-disease" />],
  ['exam practice', <ExamPractice key="s" />],
  ['exam practice, for a visitor', <ExamPractice key="s" />, true],
  ['exam results', <ExamResults key="s" />],
  ['guidelines', <GuidelinesList key="s" />],
  ['a guideline', <GuidelineView key="s" id="gl-1" />],
  ['the member directory', <Directory key="s" />],
  ['a member', <MemberPage key="s" id="u-dana" />],
  ['search', <Search key="s" />],
  ['my profile', <ProfileScreen key="s" />],
  ['my membership', <MembershipScreen key="s" />],
  ['account security', <SecurityScreen key="s" />],
  ['the accessibility statement', <AccessibilityStatement key="s" />],
  ['a message from an organisation', <BroadcastMessage key="s" id="b-1" />],
  ['scanning a code', <ScanScreen key="s" />],
  ['my application', <Applications key="s" />],
];

describe.each(['en', 'he'] as const)('every screen, in %s', (locale) => {
  it.each(screens)('%s', async (_name, screen, guest = false) => {
    world.routes = everything;
    world.guest = guest;
    const drawn = await draw(screen, locale);
    expectSound(drawn);
    // Something was drawn beyond the demo line: a screen that stays empty is not sound.
    expect(allText(drawn).length).toBeGreaterThan(80);
  });
});
