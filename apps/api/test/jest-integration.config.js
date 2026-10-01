/** Integration tests: real PostgreSQL (the iua_connect_test database). Files: test/**\/*.int-spec.ts */
const shared = require('../jest.shared');

module.exports = {
  ...shared('<rootDir>/tsconfig.json'),
  rootDir: '..',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
  // The suites share one database, so they run one at a time (--maxWorkers=1), in a worker that
  // is replaced once it holds this much memory. In one long-lived process the suites' module
  // graphs added up until Node ran out of memory in CI.
  workerIdleMemoryLimit: '1GB',
};
