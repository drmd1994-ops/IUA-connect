/**
 * Settings shared by the unit and integration Jest configs.
 *
 * Several dependencies ship as ES modules only (jose, file-type, pg-boss, unified/remark and their
 * helpers). Node 24 loads them natively at runtime, but Jest's CommonJS module system can't, so
 * tests compile them to CommonJS with ts-jest. Which packages those are is read from the pnpm
 * store ("type": "module"), so new ESM-only dependencies need no change here.
 */
const fs = require('node:fs');
const path = require('node:path');

const STORE = path.resolve(__dirname, '../../node_modules/.pnpm');

/** Names of ESM-only packages in the pnpm store (`<name>@<version>/node_modules/<name>`). */
function esmOnlyPackages() {
  const names = new Set();
  for (const entry of fs.readdirSync(STORE)) {
    const nodeModules = path.join(STORE, entry, 'node_modules');
    // "@scope+name@1.2.3" → "@scope/name"; "name@1.2.3" → "name"
    const at = entry.startsWith('@') ? entry.indexOf('@', 1) : entry.indexOf('@');
    if (at <= 0) continue;
    const name = entry.slice(0, at).replace('+', '/');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(nodeModules, name, 'package.json'), 'utf8'));
      if (pkg.type === 'module') names.add(name);
    } catch {
      // not a package folder
    }
  }
  return [...names];
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// pnpm writes scoped names as @scope+name in its store folder.
const esmPattern = esmOnlyPackages()
  .map((name) => escape(name).replace('/', '[+/]'))
  .join('|');

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
