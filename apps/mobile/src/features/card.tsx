import { ApiError, type components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { encode } from 'uqr';
import { useFormatter, useTranslations } from 'use-intl';
import { WEB_URL } from '@/config';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { secureStore } from '@/session/secure-store';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Notice, Screen, Title } from '@/ui/kit';
import { CARD_KEY, CODE_REFRESH_MS, type KeptCard, parseKeptCard, verifyUrl } from './card-model';

type MyMembership = components['schemas']['MyMembershipDto'];
type Profile = { firstName: string | null; lastName: string | null };

/**
 * The digital membership card: the member's name, the kind of membership, until when, and a
 * code that the site's verification page checks. The code changes every few minutes. Without a
 * connection the card is shown as it last was, with its date, and without a code.
 */
export function MembershipCard() {
  const all = useTranslations();
  const t = useTranslations('membership.card');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const { request } = useSession();
  const [card, setCard] = useState<KeptCard | null>(null);
  const [known, setKnown] = useState(false);
  const [offline, setOffline] = useState(false);
  const [token, setToken] = useState<{ value: string; at: Date } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  // What was kept is shown at once; what the server says replaces it.
  useEffect(() => {
    let active = true;
    secureStore
      .get(CARD_KEY)
      .then((stored) => {
        if (active) setCard((current) => current ?? parseKeptCard(stored));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<MyMembership>('/api/v1/me/membership'),
      request<Profile>('/api/v1/me/profile'),
    ])
      .then(([mine, profile]) => {
        if (!active) return;
        setOffline(false);
        setError(null);
        setKnown(true);
        if (!mine.membership) {
          setCard(null);
          void secureStore.remove(CARD_KEY).catch(() => undefined);
          return;
        }
        const fresh: KeptCard = {
          person: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
          organisationHe: mine.membership.organisation.nameHe,
          organisationEn: mine.membership.organisation.nameEn,
          typeHe: mine.membership.type.nameHe,
          typeEn: mine.membership.type.nameEn,
          status: mine.membership.status,
          endDate: mine.membership.endDate,
          fetchedAt: new Date().toISOString(),
        };
        setCard(fresh);
        void secureStore.set(CARD_KEY, JSON.stringify(fresh)).catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        // The server answered "no": that is shown. No answer at all: the kept card stands.
        if (caught instanceof ApiError) setError(caught);
        else setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [request, attempt]);

  const active = known && !offline && card?.status === 'ACTIVE';
  const fetchToken = useCallback(async () => {
    try {
      const result = await request<{ token: string }>('/api/v1/me/membership/card-token');
      setToken({ value: result.token, at: new Date() });
    } catch (caught) {
      setToken(null);
      if (caught instanceof ApiError) setError(caught);
      else setOffline(true);
    }
  }, [request]);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => void fetchToken(), 0);
    const timer = setInterval(() => void fetchToken(), CODE_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, fetchToken]);

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {offline && card && (
        <Notice tone="warning">{m('card.offline', { date: date(card.fetchedAt) })}</Notice>
      )}
      {offline && !card && <Notice tone="warning">{m('unreachable.title')}</Notice>}
      {offline && <Button label={m('card.retry')} onPress={() => setAttempt((n) => n + 1)} />}
      {!card && !known && !offline && error === null && <Body muted>{m('loading')}</Body>}
      {known && !offline && card?.status !== 'ACTIVE' && <Notice>{t('noActive')}</Notice>}
      {card && (card.status === 'ACTIVE' || offline) && (
        <View style={styles.card} accessible={false}>
          {card.organisationHe && card.organisationEn && (
            <Text style={styles.association}>
              {locale === 'he' ? card.organisationHe : card.organisationEn}
            </Text>
          )}
          <Text style={styles.person} accessibilityRole="header">
            {card.person}
          </Text>
          <Text style={styles.line}>{locale === 'he' ? card.typeHe : card.typeEn}</Text>
          <Text style={styles.muted}>{t('validUntil', { date: date(card.endDate) })}</Text>
          {active && token && (
            <>
              <QrCode
                value={verifyUrl(WEB_URL, locale, token.value)}
                label={t('qrLabel', { name: card.person })}
              />
              <Text style={styles.muted} accessibilityLiveRegion="polite">
                {t('refreshed', { time: format.dateTime(token.at, { timeStyle: 'short' }) })}
              </Text>
            </>
          )}
          {active && !token && error === null && <Text style={styles.muted}>{m('loading')}</Text>}
        </View>
      )}
      {active && token && <Body muted>{m('card.brightness')}</Body>}
    </Screen>
  );
}

/** A QR code drawn from its matrix: dark squares on white, with the quiet edge scanners need. */
function QrCode({ value, label, size = 240 }: { value: string; label: string; size?: number }) {
  const { data } = encode(value, { ecc: 'M', border: 4 });
  const count = data.length;
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <Rect width={count} height={count} fill="#ffffff" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  association: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand[800],
    textAlign: 'center',
  },
  person: { fontSize: 24, fontWeight: '600', color: semantic.text, textAlign: 'center' },
  line: { fontSize: 16, color: semantic.text, textAlign: 'center' },
  muted: { fontSize: 14, color: semantic.textMuted, textAlign: 'center' },
});
