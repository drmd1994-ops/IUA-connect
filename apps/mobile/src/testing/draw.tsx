import { getMessages } from '@iua/i18n';
import { act, render } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { IntlProvider } from 'use-intl';
import { GuestProvider } from '@/features/visitor';
import { installPluralRules } from '@/i18n/plural-rules';
import { world } from './world';

installPluralRules();

type Drawn = Awaited<ReturnType<typeof render>>;

/**
 * Draws a screen with the real texts of the given language, and waits until it has asked the
 * pretend server what it needs and settled.
 */
export async function draw(screen: ReactElement, locale: 'he' | 'en' = 'en'): Promise<Drawn> {
  world.locale = locale;
  const drawn = await render(
    <IntlProvider
      locale={locale}
      messages={getMessages(locale)}
      timeZone="Asia/Jerusalem"
      now={new Date('2026-10-06T09:00:00Z')}
      onError={(error) => world.textErrors.push(`${error.code}: ${error.originalMessage ?? ''}`)}
      getMessageFallback={({ namespace, key }) =>
        `MISSING:${[namespace, key].filter(Boolean).join('.')}`
      }
    >
      {world.guest ? (
        <GuestProvider toSignIn={() => world.pushed.push('(sign in)')}>{screen}</GuestProvider>
      ) : (
        screen
      )}
    </IntlProvider>,
  );
  await settle();
  return drawn;
}

/** Lets what a screen started (requests, timers of zero length) finish. */
export async function settle(rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const NAMED_ROLES = ['button', 'link', 'radio', 'switch', 'imagebutton', 'checkbox', 'tab'];

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[] | null;
}

/** Every element of what was drawn, top to bottom. */
function walk(node: Node | string | null, visit: (node: Node) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * What a screen reader would stumble on: a control without a name, and a text box without one.
 * Answers a description of each, empty when all is well.
 */
export function unnamedControls(drawn: Drawn): string[] {
  const problems: string[] = [];
  const root = drawn.toJSON() as Node | Node[] | null;
  for (const top of Array.isArray(root) ? root : [root]) {
    walk(top, (node) => {
      const role = node.props.accessibilityRole ?? node.props.role;
      const name = node.props.accessibilityLabel ?? node.props['aria-label'];
      // A piece of text that is itself a link is named by its own words.
      const ownWords =
        node.type === 'Text' &&
        (node.children ?? []).some((child) => typeof child === 'string' && child.trim() !== '');
      const named = (typeof name === 'string' && name.trim() !== '') || ownWords;
      if (typeof role === 'string' && NAMED_ROLES.includes(role) && !named) {
        problems.push(`a ${role} without a name`);
      }
      if (node.type === 'TextInput' && !named) problems.push('a text box without a name');
    });
  }
  return problems;
}

/** All the text that was drawn, in order. */
export function allText(drawn: Drawn): string {
  const parts: string[] = [];
  const collect = (node: Node | string | null): void => {
    if (!node) return;
    if (typeof node === 'string') return void parts.push(node);
    for (const child of node.children ?? []) collect(child);
  };
  const root = drawn.toJSON() as Node | Node[] | null;
  for (const top of Array.isArray(root) ? root : [root]) collect(top);
  return parts.join(' ');
}

/**
 * The checks every screen must pass in a language: every text exists and could be written, no
 * control is nameless, and the screen asked the server for nothing that was not foreseen.
 */
export function expectSound(drawn: Drawn): void {
  expect(world.textErrors).toEqual([]);
  expect(allText(drawn)).not.toMatch(/MISSING:/);
  expect(unnamedControls(drawn)).toEqual([]);
  expect(world.unanswered).toEqual([]);
}
