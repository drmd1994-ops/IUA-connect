import type { components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import { type Href, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';
import { useLocalName } from './reference';
import { type Scanned, parseScan, safeFileName } from './scan-model';

type Verification = components['schemas']['CardVerificationDto'];
type Outcome =
  | { kind: 'checkIn'; slug: string; recorded: boolean }
  | { kind: 'card'; result: Verification }
  | { kind: 'unknown' };

/**
 * Scanning a code of Med Connect with the phone's camera: the code shown at an event's venue
 * records the member's attendance; the code on a membership card is checked.
 */
export function ScanScreen() {
  const all = useTranslations();
  const t = useTranslations('mobile.scan');
  const e = useTranslations('events.checkIn');
  const v = useTranslations('membership.verify');
  const name = useLocalName();
  const router = useRouter();
  const { request } = useSession();
  const [permission, ask] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** A code is acted on once, though the camera reports it many times a second. */
  const busy = useRef(false);

  const act = useCallback(
    async (scanned: Scanned | null) => {
      if (!scanned) return setOutcome({ kind: 'unknown' });
      if (scanned.kind === 'event') {
        return router.replace(`/events/${encodeURIComponent(scanned.slug)}`);
      }
      if (scanned.kind === 'checkIn') {
        const result = await request<{ recorded: boolean }>(
          `/api/v1/events/${encodeURIComponent(scanned.slug)}/check-in`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: scanned.token }),
          },
        );
        return setOutcome({ kind: 'checkIn', slug: scanned.slug, recorded: result.recorded });
      }
      const result = await request<Verification>(
        `/api/v1/card/verify?t=${encodeURIComponent(scanned.token)}`,
      );
      return setOutcome({ kind: 'card', result });
    },
    [request, router],
  );

  function onScanned(data: string) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError(null);
    act(parseScan(data))
      .catch((caught: unknown) => setError(caught))
      .finally(() => setWorking(false));
  }
  function again() {
    busy.current = false;
    setOutcome(null);
    setError(null);
  }

  const done = outcome !== null || error !== null;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {!permission?.granted && (
        <Card>
          <Body>{t('permission')}</Body>
          <Button label={t('allow')} onPress={() => void ask()} />
          {permission && !permission.canAskAgain && (
            <Body muted>{all('mobile.chat.noCamera')}</Body>
          )}
        </Card>
      )}
      {permission?.granted && !done && (
        <View style={styles.camera} accessibilityLabel={t('camera')}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onScanned(data)}
          />
        </View>
      )}
      {working && <Body muted>{e('working')}</Body>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {outcome?.kind === 'unknown' && <Notice tone="warning">{t('unknown')}</Notice>}
      {outcome?.kind === 'checkIn' && (
        <>
          <Heading>{e('title')}</Heading>
          <Notice tone="success">{outcome.recorded ? e('done') : e('already')}</Notice>
          <Button
            label={e('toEvent')}
            variant="secondary"
            onPress={() => router.replace(`/events/${encodeURIComponent(outcome.slug)}` as Href)}
          />
        </>
      )}
      {outcome?.kind === 'card' && (
        <>
          <Heading>{v('title')}</Heading>
          {outcome.result.valid ? (
            <>
              <Notice tone="success">{v('valid')}</Notice>
              <Card>
                {outcome.result.name && <Body>{`${v('name')}: ${outcome.result.name}`}</Body>}
                {outcome.result.type && <Body>{`${v('type')}: ${name(outcome.result.type)}`}</Body>}
              </Card>
            </>
          ) : (
            <>
              <Notice tone="warning">{v('invalid')}</Notice>
              <Body muted>{v('invalidHint')}</Body>
            </>
          )}
        </>
      )}
      {done && <Button label={t('again')} onPress={again} />}
    </Screen>
  );
}

/**
 * Saves a calendar file of the API and hands it to the phone, which offers the calendar apps.
 * The file is asked for with the member's session, so members-only events work too.
 */
export function useSaveCalendar() {
  const { session } = useSession();
  return useCallback(
    async (path: string, title: string) => {
      const response = await session.fetch(path);
      if (!response.ok) throw new Error(`calendar ${response.status}`);
      const file = new File(Paths.cache, safeFileName(title, 'ics'));
      if (file.exists) file.delete();
      file.create();
      file.write(await response.text());
      await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: title });
    },
    [session],
  );
}

const styles = StyleSheet.create({
  camera: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: semantic.text,
  },
});
