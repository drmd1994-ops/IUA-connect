import { toApiError } from '@medconnect/api-client';

/**
 * The pretend world a screen is drawn in: a pretend server that answers from a table, a pretend
 * router that records where the screen wanted to go, and the language. One world for all tests;
 * `resetWorld` empties it before each.
 */

/** What the pretend server says for one address: a fixed answer, or one worked out from the request. */
export type AnswerFor = (request: { method: string; path: string; body: unknown }) => unknown;
export type Answer = Record<string, unknown> | unknown[] | AnswerFor;

export interface Call {
  method: string;
  /** The address without its query. */
  path: string;
  query: string;
  body: unknown;
}

/** Thrown by an answer to make the pretend server refuse, as the real one would. */
export class Refuse {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: { code: string }[] = [],
  ) {}
}

export const world = {
  locale: 'en' as 'he' | 'en',
  guest: false,
  /** "METHOD /path" → what the server answers. A path may end in "*" to match what follows. */
  routes: {} as Record<string, Answer>,
  calls: [] as Call[],
  /** Requests no route answered; a test fails when a screen asks for something unforeseen. */
  unanswered: [] as string[],
  pushed: [] as string[],
  params: {} as Record<string, string>,
  /** Text problems reported while drawing: a missing text, or a text that could not be written. */
  textErrors: [] as string[],
  session: {
    signIn: jest.fn(),
    verifyCode: jest.fn(),
    signOut: jest.fn(),
    restore: jest.fn(),
    refresh: jest.fn(async () => true),
    accessToken: () => 'test-access-token',
    fetch: jest.fn(),
  },
};

export function resetWorld(): void {
  world.locale = 'en';
  world.guest = false;
  world.routes = {};
  world.calls = [];
  world.unanswered = [];
  world.pushed = [];
  world.params = {};
  world.textErrors = [];
  for (const mock of Object.values(world.session)) {
    if (jest.isMockFunction(mock)) mock.mockReset();
  }
  world.session.refresh.mockImplementation(async () => true);
}

function find(method: string, path: string): Answer | undefined {
  const exact = world.routes[`${method} ${path}`];
  if (exact !== undefined) return exact;
  const prefixes = Object.keys(world.routes)
    .filter((key) => key.endsWith('*') && `${method} ${path}`.startsWith(key.slice(0, -1)))
    .sort((a, b) => b.length - a.length);
  return prefixes[0] === undefined ? undefined : world.routes[prefixes[0]];
}

/** The pretend `request`: the same promise, the same errors, no network. */
export async function request<T>(target: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const [path = '', query = ''] = target.split('?');
  let body: unknown;
  try {
    body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  } catch {
    body = init.body;
  }
  world.calls.push({ method, path, query, body });
  const answer = find(method, path);
  if (answer === undefined) {
    world.unanswered.push(`${method} ${path}`);
    throw toApiError(
      404,
      { error: { code: 'NOT_FOUND', message: 'errors.notFound', correlationId: 'test' } },
      new Headers(),
    );
  }
  try {
    const value = typeof answer === 'function' ? await answer({ method, path, body }) : answer;
    // A copy, as an answer over the network would be: a screen can't change the table.
    return (value === undefined ? {} : JSON.parse(JSON.stringify(value))) as T;
  } catch (thrown) {
    if (thrown instanceof Refuse) {
      throw toApiError(
        thrown.status,
        {
          error: {
            code: thrown.code,
            message: `errors.${thrown.code}`,
            correlationId: 'test',
            details: thrown.details,
          },
        },
        new Headers(),
      );
    }
    throw thrown;
  }
}

/** The requests a screen made of one kind, for a test to look at. */
export function callsTo(method: string, path: string): Call[] {
  return world.calls.filter((call) => call.method === method && call.path === path);
}
