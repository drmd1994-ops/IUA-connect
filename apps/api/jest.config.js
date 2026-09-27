/** Unit tests: fast, no database. Files: src/**\/*.spec.ts */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client imports its own files with .js extensions.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!generated/**', '!main.ts'],
  coverageDirectory: '../coverage',
};
