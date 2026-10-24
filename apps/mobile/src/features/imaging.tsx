import { type components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocale, useTranslations } from 'use-intl';
import { WEB_URL } from '@/config';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Notice, Screen, Title } from '@/ui/kit';
import { isSiteAddress, viewerAddress } from './imaging-model';

type Scan = components['schemas']['ScanDto'];
type ViewerLink = components['schemas']['ScanViewerDto'];

/**
 * Scans (M36) in the app: a case's or a library item's scans, each opening the full viewer in a
 * screen of the app (owner's answer: part of the app, not separate). Scans are added on the site.
 */
export function ScanList({ scans }: { scans: Scan[] }) {
  const t = useTranslations('imaging.scans');
  const router = useRouter();
  return (
    <View style={styles.list}>
      <Body muted>{t('notice')}</Body>
      {scans.map((scan, index) => (
        <View key={scan.id} style={styles.scan}>
          <Body>
            {t('summary', {
              modalities: scan.modalities,
              series: scan.seriesCount,
              images: scan.instanceCount,
            })}
          </Body>
          <Button
            label={scans.length > 1 ? t('viewNumber', { number: index + 1 }) : t('view')}
            variant="secondary"
            onPress={() => router.push(`/scans/${scan.id}`)}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The viewer, inside the app: the API gives a signed link to this one scan after its access
 * check, and the site's viewer opens with it. The app's sign-in never goes into the viewer.
 * Only the site's own pages open here; anything else opens in the phone's browser.
 */
export function ScanViewerScreen({ id }: { id: string }) {
  const t = useTranslations('imaging.viewer');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const { request } = useSession();
  const [address, setAddress] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    request<ViewerLink>(`/api/v1/imaging/scans/${encodeURIComponent(id)}/viewer`)
      .then((link) => active && setAddress(viewerAddress(WEB_URL, link, locale)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [request, id, locale]);

  if (!address) {
    return (
      <Screen>
        <Back />
        <Title>{t('title')}</Title>
        {failed ? <Notice tone="error">{t('failed')}</Notice> : <Body>{t('opening')}</Body>}
      </Screen>
    );
  }
  return (
    <SafeAreaView style={styles.full}>
      <Text style={styles.banner} accessibilityRole="text">
        {m('demoBanner')}
      </Text>
      <Back />
      <WebView
        source={{ uri: address }}
        style={styles.full}
        accessibilityLabel={t('title')}
        originWhitelist={[WEB_URL]}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          if (isSiteAddress(WEB_URL, request.url)) return true;
          void Linking.openURL(request.url);
          return false;
        }}
        onError={() => setFailed(true)}
      />
      {failed && <Notice tone="error">{t('failed')}</Notice>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  scan: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 8,
  },
  full: { flex: 1, backgroundColor: semantic.background },
  // As every screen's demo banner (ui/kit).
  banner: {
    backgroundColor: colors.accent[100],
    color: colors.accent[700],
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 13,
  },
});
