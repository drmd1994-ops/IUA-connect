/** Integration tests: real PostgreSQL (the iua_connect_test database). Files: test/**\/*.int-spec.ts */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client imports its own files with .js extensions.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
};
