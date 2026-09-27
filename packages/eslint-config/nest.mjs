import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from './base.mjs';

const element = (type, extra = {}) => ({ element: { type, ...extra } });

/**
 * NestJS API rules. Module boundaries (ARCHITECTURE.md §1):
 * - a feature module may import another feature module only through its `index.ts` (public API);
 * - `common`, `config` and `infra` never import feature modules;
 * - `config` depends on nothing else in the app.
 * Unit tests (*.spec.ts) and test helpers are exempt, so they can assemble any fixture.
 */
export default tseslint.config(
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Nest's dependency injection needs runtime imports for constructor parameter types
      // (emitDecoratorMetadata), so type-only import rewriting is disabled here.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/ignore': ['src/**/*.spec.ts', 'src/testing/**'],
      'boundaries/elements': [
        { type: 'module', pattern: 'src/modules/*', capture: ['moduleName'] },
        { type: 'common', pattern: 'src/common' },
        { type: 'config', pattern: 'src/config' },
        { type: 'infra', pattern: 'src/infra' },
        { type: 'generated', pattern: 'src/generated' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // Files inside the same element may import each other freely.
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            {
              from: element('module'),
              allow: {
                to: [
                  element('module', { fileInternalPath: 'index.ts' }),
                  element('common'),
                  element('config'),
                  element('infra'),
                  element('generated'),
                ],
              },
            },
            {
              from: element('infra'),
              allow: { to: [element('common'), element('config'), element('generated')] },
            },
            {
              from: element('common'),
              allow: { to: [element('config'), element('infra')] },
            },
          ],
        },
      ],
    },
  },
  {
    // Composition roots (main.ts, app.module.ts, ...) are files, not folders, so boundaries
    // can't classify them; this rule keeps them on the modules' public API too.
    files: ['src/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\./modules/[^/]+/.+',
              message: 'Import a feature module through its index.ts (e.g. ./modules/audit).',
            },
          ],
        },
      ],
    },
  },
);
