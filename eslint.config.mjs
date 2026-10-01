// Root config: lints repository tooling (tools/scripts). Each app and package has its own eslint.config.mjs.
import base from '@iua/eslint-config/base';

export default [
  // The importer is a workspace package with its own config and lint task.
  { ignores: ['tools/importer/**'] },
  ...base,
  {
    files: ['tools/**/*.mjs'],
    rules: {
      // CLI scripts report progress on the console.
      'no-console': 'off',
    },
  },
];
