// The app's screens are tested here, drawn without a phone (docs/plans/M15-mobile-app-everything.md §5).
// The app's rules have their own, faster tests in vitest (`*.test.ts`); these are `*.test.tsx`.

// Libraries that are published as modern JavaScript and must be translated before a test can
// load them. The first part allows for the folder pnpm keeps packages in.
const translated = [
  '(jest-)?react-native',
  '@react-native(-community)?',
  'expo(nent)?',
  '@expo(nent)?[/+].*',
  '@react-navigation[/+].*',
  'react-native-svg',
  'use-intl',
  'intl-messageformat',
  '@formatjs[/+].*',
  'uqr',
  'test-renderer',
].join('|');

module.exports = {
  // The screens were written for Android; tests of what differs on an iPhone set it themselves (M37).
  preset: 'jest-expo/android',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/src/testing/setup.tsx'],
  transformIgnorePatterns: [`node_modules/(?!(?:\\.pnpm/)?(${translated}))`],
  testTimeout: 20000,
};
