import base from '@iua/eslint-config/base';

export default [
  ...base,
  {
    files: ['src/cli.ts'],
    rules: {
      // The command-line tool reports progress on the console.
      'no-console': 'off',
    },
  },
];
