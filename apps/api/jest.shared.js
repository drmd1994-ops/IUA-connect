/**
 * Settings shared by the unit and integration Jest configs.
 *
 * Some dependencies ship as ES modules only (jose). Node 24 loads them natively at runtime, but
 * Jest's CommonJS module system can't, so tests compile them to CommonJS with ts-jest.
 */
const ESM_ONLY_PACKAGES = ['jose'];

const esmPattern = ESM_ONLY_PACKAGES.join('|');

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
