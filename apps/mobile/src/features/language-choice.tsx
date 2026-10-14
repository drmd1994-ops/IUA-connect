import { LOCALES } from '@medconnect/i18n';
import { StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { useLocaleSettings } from '@/i18n/i18n-provider';
import { Button, Card, Heading, Notice } from '@/ui/kit';

/** Hebrew or English. A change of direction is finished the next time the app opens. */
export function LanguageChoice() {
  const t = useTranslations('mobile.language');
  const { locale, setLocale, needsRestart } = useLocaleSettings();
  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <View style={styles.row}>
        {LOCALES.map((option) => (
          <View key={option} style={styles.choice}>
            <Button
              label={t(option)}
              variant={option === locale ? 'primary' : 'secondary'}
              onPress={() => setLocale(option)}
            />
          </View>
        ))}
      </View>
      {needsRestart && <Notice tone="warning">{t('restart')}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  choice: { flex: 1 },
});
