import nest from '@iua/eslint-config/nest';

export default [
  ...nest,
  {
    files: ['prisma/**/*.ts'],
    rules: {
      // Seed and maintenance scripts report progress on the console.
      'no-console': 'off',
    },
  },
  {
    files: ['jest.config.js', 'test/*.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
