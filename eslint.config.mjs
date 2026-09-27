// Root config: lints repository tooling (tools/). Each app and package has its own eslint.config.mjs.
import base from '@iua/eslint-config/base';

export default [
  ...base,
  {
    files: ['tools/**/*.mjs'],
    rules: {
      // CLI scripts report progress on the console.
      'no-console': 'off',
    },
  },
];
