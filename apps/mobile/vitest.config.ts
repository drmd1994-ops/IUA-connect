import { defineConfig } from 'vitest/config';

// Only the app's rules are tested here: modules that know nothing of React Native or the phone.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
