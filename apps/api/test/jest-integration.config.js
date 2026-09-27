/** Integration tests: real PostgreSQL (the iua_connect_test database). Files: test/**\/*.int-spec.ts */
const shared = require('../jest.shared');

module.exports = {
  ...shared('<rootDir>/tsconfig.json'),
  rootDir: '..',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
};
