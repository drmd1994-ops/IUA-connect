import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: { plugins: unknown[] };
};

// Expo checks this only when it makes the Android project, after the checks have passed.
describe("the app's plugins", () => {
  it('are each a name, or a name with one settings object', () => {
    for (const plugin of app.expo.plugins) {
      if (typeof plugin === 'string') continue;
      expect(Array.isArray(plugin), JSON.stringify(plugin)).toBe(true);
      const [name, settings, ...rest] = plugin as unknown[];
      expect(typeof name, JSON.stringify(plugin)).toBe('string');
      expect(typeof settings, JSON.stringify(plugin)).toBe('object');
      expect(rest, JSON.stringify(plugin)).toEqual([]);
    }
  });
});

// The texts iOS shows when it asks for a permission (M37). Android writes its own, in the phone's
// language, so these files hold iOS texts only and Android is unchanged.
describe("the iPhone's permission texts", () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8')) as {
      ios?: Record<string, string>;
    };

  it('are for iOS only, the same ones in Hebrew and English', () => {
    const he = read('he');
    const en = read('en');
    expect(Object.keys(he)).toEqual(['ios']);
    expect(Object.keys(en)).toEqual(['ios']);
    expect(Object.keys(he.ios ?? {}).sort()).toEqual(Object.keys(en.ios ?? {}).sort());
  });

  it('cover every permission text the app asks for', () => {
    const en = read('en').ios ?? {};
    expect(Object.keys(en).sort()).toEqual([
      'NSCameraUsageDescription',
      'NSFaceIDUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ]);
  });
});
