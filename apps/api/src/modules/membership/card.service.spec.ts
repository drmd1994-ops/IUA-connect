import { testEnv } from '../../testing/test-env';
import { AccessTokenService } from '../auth/access-token.service';
import { type PrismaService } from '../../infra/prisma/prisma.service';
import { CARD_TOKEN_TTL_SEC, CardService } from './card.service';

const env = testEnv();

const ORGANISATION = {
  id: '0190a000-0000-7000-8000-0000000000a1',
  slug: 'a-society',
  nameHe: 'אגודה לדוגמה',
  nameEn: 'A sample society',
};

const membership = (overrides: Record<string, unknown> = {}) => ({
  id: '0190a000-0000-7000-8000-00000000c0de',
  status: 'ACTIVE',
  endDate: new Date('2999-12-31T00:00:00Z'),
  type: { key: 'FULL_MEMBER', nameHe: 'חברות מלאה', nameEn: 'Full member' },
  organisation: { ...ORGANISATION, active: true },
  user: { status: 'ACTIVE', profile: { firstName: 'Dana', lastName: 'Fictional' } },
  ...overrides,
});

function service(row: ReturnType<typeof membership> | null = membership()) {
  const prisma = {
    membership: { findUnique: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  return new CardService(env, prisma);
}

describe('CardService', () => {
  afterEach(() => jest.useRealTimers());

  it('signs a token that verifies to the name, the organisation and the type only', async () => {
    const cards = service();
    const { token, expiresAt } = await cards.issue('user-id', ORGANISATION.id);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(
      CARD_TOKEN_TTL_SEC * 1000,
    );
    // The token names the membership only: no name, email or numbers.
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(await cards.verify(token)).toEqual({
      valid: true,
      name: 'Dana Fictional',
      organisation: ORGANISATION,
      type: { key: 'FULL_MEMBER', nameHe: 'חברות מלאה', nameEn: 'Full member' },
    });
  });

  it('refuses a card for a membership that is not active', async () => {
    await expect(service(null).issue('u', ORGANISATION.id)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
    await expect(
      service(membership({ status: 'SUSPENDED' })).issue('u', ORGANISATION.id),
    ).rejects.toBeDefined();
    await expect(
      service(membership({ endDate: new Date('2000-12-31T00:00:00Z') })).issue(
        'u',
        ORGANISATION.id,
      ),
    ).rejects.toBeDefined();
  });

  it('reads as invalid once expired', async () => {
    const cards = service();
    const { token } = await cards.issue('u', ORGANISATION.id);
    jest.useFakeTimers({ now: Date.now() + (CARD_TOKEN_TTL_SEC + 5) * 1000 });
    expect(await cards.verify(token)).toEqual({
      valid: false,
      name: null,
      organisation: null,
      type: null,
    });
  });

  it('reads as invalid when tampered with', async () => {
    const cards = service();
    const { token } = await cards.issue('u', ORGANISATION.id);
    const [header, payload, signature] = token.split('.');
    const forged = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    forged.sub = '0190a000-0000-7000-8000-000000000bad';
    const tampered = [header, Buffer.from(JSON.stringify(forged)).toString('base64url'), signature];
    expect((await cards.verify(tampered.join('.'))).valid).toBe(false);
    expect((await cards.verify('not-a-token')).valid).toBe(false);
  });

  it('keeps card tokens and access tokens apart', async () => {
    const cards = service();
    const access = new AccessTokenService(env);
    const { token: accessToken } = await access.sign({ userId: 'u', sessionId: 's', mfa: false });
    expect((await cards.verify(accessToken)).valid).toBe(false);
    const { token: cardToken } = await cards.issue('u', ORGANISATION.id);
    expect(await access.verify(cardToken)).toBeNull();
  });

  it('reads as invalid when the membership lapsed or the account was disabled since', async () => {
    const { token } = await service().issue('u', ORGANISATION.id);
    expect((await service(membership({ status: 'SUSPENDED' })).verify(token)).valid).toBe(false);
    expect(
      (await service(membership({ user: { status: 'DISABLED', profile: null } })).verify(token))
        .valid,
    ).toBe(false);
    expect((await service(null).verify(token)).valid).toBe(false);
  });

  it('reads as invalid when the organisation is no longer active', async () => {
    const { token } = await service().issue('u', ORGANISATION.id);
    const closed = membership({ organisation: { ...ORGANISATION, active: false } });
    expect(await service(closed).verify(token)).toEqual({
      valid: false,
      name: null,
      organisation: null,
      type: null,
    });
  });
});
