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
