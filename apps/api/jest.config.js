/** Unit tests: fast, no database. Files: src/**\/*.spec.ts */
const shared = require('./jest.shared');

module.exports = {
  ...shared('<rootDir>/../tsconfig.json'),
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!generated/**', '!main.ts'],
  coverageDirectory: '../coverage',
};
