/**
 * Settings shared by the unit and integration Jest configs.
 *
 * Some dependencies ship as ES modules only (jose; file-type, pg-boss and their helpers, M3).
 * Node 24 loads them natively at runtime, but Jest's CommonJS module system can't, so tests compile them to CommonJS with ts-jest.
 */
const ESM_ONLY_PACKAGES = [
  'jose',
  'file-type',
  'strtok3',
  'token-types',
  'uint8array-extras',
  '@tokenizer/inflate',
  '@borewit/text-codec',
  'pg-boss',
  'rrule-temporal',
  'temporal-spec',
  'serialize-error',
  'non-error',
];

// pnpm writes scoped names as @scope+name in its store folder.
const esmPattern = ESM_ONLY_PACKAGES.map((name) => name.replace('/', '[+/]')).join('|');

module.exports = (tsconfig) => ({
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig, diagnostics: { ignoreCodes: [151002] } }],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022', isolatedModules: true },
        diagnostics: false,
      },
    ],
  },
  // Transform the ESM-only packages (pnpm layout: node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>).
  transformIgnorePatterns: [
    `/node_modules/(?!(\\.pnpm/(${esmPattern})@[^/]+/node_modules/)?(${esmPattern})/)`,
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client (and ESM packages) import their own files with .js extensions.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
});
