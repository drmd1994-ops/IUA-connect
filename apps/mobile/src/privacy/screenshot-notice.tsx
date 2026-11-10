import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useTranslations } from 'use-intl';

type ScreenPrivacy = {
  addListener(event: 'onScreenshot', listener: () => void): { remove(): void };
};

/**
 * After a screenshot on an iPhone, says why it came out blank. Draws nothing.
 *
 * The app's own iOS module (`modules/screen-privacy`, M37 plan §2, item 5) keeps the app out of
 * screenshots and recordings by itself; here it only reports a screenshot. Android blocks
 * screenshots with FLAG_SECURE and has no such module, so nothing happens there.
 */
export function ScreenshotNotice() {
  const t = useTranslations('mobile.screenshot');
  useEffect(() => {
    const screenPrivacy = requireOptionalNativeModule<ScreenPrivacy>('ScreenPrivacy');
    const subscription = screenPrivacy?.addListener('onScreenshot', () =>
      Alert.alert(t('title'), t('body')),
    );
    return () => subscription?.remove();
  }, [t]);
  return null;
}
