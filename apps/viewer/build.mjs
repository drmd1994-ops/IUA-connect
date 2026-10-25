#!/usr/bin/env node
/**
 * Builds the OHIF viewer for Med Connect (M36 plan §4): the pinned release of ohif.json, with the
 * changes in patches/ and the settings in app-config.js, served by the site under /viewer.
 *
 *   node apps/viewer/build.mjs [outDir]
 *
 * OHIF is built where it lives, in its own folder outside this repository (it has its own pnpm
 * version and workspace), and only the finished bundle is copied to outDir (default:
 * apps/viewer/dist). The build fails if the bundle has the guided tours' library (shepherd.js,
 * AGPL-3.0) in it, or if any shipped library is under the GPL family. The licences of what is
 * shipped are written next to the bundle (THIRD-PARTY-NOTICES.txt), as their licences require.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(readFileSync(path.join(here, 'ohif.json'), 'utf8'));
const outDir = path.resolve(process.argv[2] ?? path.join(here, 'dist'));
const work = process.env.VIEWER_WORKDIR ?? path.join(tmpdir(), `medconnect-ohif-${pin.tag}`);
const isWindows = process.platform === 'win32';

/** Runs a command, printing it; `env` adds to the environment. */
function run(cmd, args, { cwd = work, env = {}, capture = false } = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  // On Windows npx is a .cmd file, run through the shell: paths with spaces are quoted for it.
  const quoted = isWindows ? args.map((a) => (/[\s&()]/.test(a) ? `"${a}"` : a)) : args;
  return execFileSync(cmd, quoted, {
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: isWindows,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GITHUB_TOKEN: '', ...env },
  });
}

const git = (args, opts) =>
  run('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], opts);
const pnpm = (args, opts) => run('npx', ['--yes', `pnpm@${pin.pnpm}`, ...args], opts);

// VIEWER_SKIP_BUILD=1 reuses the last build in the work folder (to rerun the checks and the copy).
if (!process.env.VIEWER_SKIP_BUILD) build();

function build() {
  // 1. The pinned source, clean (installed libraries are kept between builds).
  if (!existsSync(path.join(work, '.git'))) {
    git(['clone', '--depth', '1', '--branch', pin.tag, pin.repository, work], { cwd: tmpdir() });
  }
  git(['checkout', '--force', pin.commit]);
  git(['clean', '-fd']);
  const head = git(['rev-parse', 'HEAD'], { capture: true }).trim();
  if (head !== pin.commit) throw new Error(`OHIF ${pin.tag} is ${head}, expected ${pin.commit}`);

  // 2. Our changes and settings.
  const patches = readdirSync(path.join(here, 'patches'))
    .filter((f) => f.endsWith('.patch'))
    .sort();
  for (const patch of patches)
    git(['apply', '--whitespace=nowarn', path.join(here, 'patches', patch)]);
  cpSync(
    path.join(here, 'app-config.js'),
    path.join(work, 'platform/app/public/config/medconnect.js'),
  );
  const locales = path.join(here, 'locales');
  if (existsSync(locales)) {
    cpSync(locales, path.join(work, 'platform/i18n/src/locales'), { recursive: true });
  }

  // 3. Install exactly what OHIF's lock file says, and build.
  // OHIF's own test tools are not needed to build it; their large downloads are skipped.
  pnpm(['install', '--frozen-lockfile'], {
    env: {
      CYPRESS_INSTALL_BINARY: '0',
      PUPPETEER_SKIP_DOWNLOAD: '1',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
  });
  fixProbe();
  pnpm(['--filter', '@ohif/app', 'run', 'build:viewer'], {
    env: {
      APP_CONFIG: 'config/medconnect.js',
      PUBLIC_URL: '/viewer/',
      NODE_OPTIONS: '--max-old-space-size=8192',
    },
  });
}
const dist = path.join(work, 'platform/app/dist');

// 4. Licences: no GPL-family library shipped; shepherd.js (installed, never imported) not bundled.
const licences = JSON.parse(
  pnpm(['licenses', 'list', '--prod', '--json', '-r'], { capture: true }),
);
const shipped = Object.entries(licences).flatMap(([licence, list]) =>
  list.map((p) => ({ licence, ...p })),
);
const NOT_BUNDLED = new Set(['shepherd.js']);
const gpl = shipped.filter((p) => /GPL/i.test(p.licence) && !NOT_BUNDLED.has(p.name));
if (gpl.length) {
  throw new Error(`GPL-family libraries in the viewer: ${gpl.map((p) => p.name).join(', ')}`);
}
// The start page's small inline scripts move into files of their own, so the site's security
// policy for the viewer allows no inline script at all.
const indexFile = path.join(dist, 'index.html');
let inline = 0;
const page = readFileSync(indexFile, 'utf8').replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => {
  const name = `start-${++inline}.js`;
  writeFileSync(path.join(dist, name), code);
  return `<script src="/viewer/${name}"></script>`;
});
writeFileSync(indexFile, page);
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(page))
  throw new Error('An inline script is left in index.html');
// Source maps are not shipped: they would publish the sources and double the size.
for (const file of walk(dist)) if (file.endsWith('.map')) rmSync(file);
// The library's own marks: its class names (shepherd-element, shepherd-modal…) and its import.
const SHEPHERD = /shepherd-[a-z]|['"]shepherd\.js['"]/i;
for (const file of walk(dist)) {
  if (!/\.(js|mjs|css|html)$/.test(file)) continue;
  if (SHEPHERD.test(readFileSync(file, 'utf8'))) {
    throw new Error(`shepherd.js found in the bundle: ${path.relative(dist, file)}`);
  }
}

// 5. The notices, then the bundle.
const notices = [
  'Third-party software in the Med Connect viewer (OHIF Viewer and the libraries it ships).',
  `OHIF Viewer ${pin.tag} (${pin.commit}), with Med Connect's changes listed in apps/viewer/patches.`,
  '',
];
for (const p of shipped
  .filter((s) => !NOT_BUNDLED.has(s.name))
  .sort((a, b) => a.name.localeCompare(b.name))) {
  for (const version of p.versions ?? [p.version]) {
    notices.push('-'.repeat(78), `${p.name}@${version} (${p.licence})`);
    const dir = (p.paths ?? [p.path]).find(Boolean);
    const text = dir ? licenceText(dir) : null;
    notices.push(text ?? `Licence: ${p.licence}. ${p.author ? `Author: ${p.author}.` : ''}`, '');
  }
}
// Emptied rather than removed: on Windows a folder someone has open can't be removed.
mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir))
  rmSync(path.join(outDir, name), { recursive: true, force: true });
mkdirSync(path.dirname(outDir), { recursive: true });
cpSync(dist, outDir, { recursive: true });
writeFileSync(path.join(outDir, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));
const hash = createHash('sha256');
for (const file of walk(outDir).sort())
  hash.update(path.relative(outDir, file)).update(readFileSync(file));
console.log(
  `\nViewer built: ${outDir} (${shipped.length} libraries, content ${hash.digest('hex').slice(0, 16)})`,
);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function licenceText(dir) {
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  return file ? readFileSync(path.join(dir, file), 'utf8').trim() : null;
}

/**
 * The point tool ("Probe") showed no value on a stack of images: it read the pixel at the stack's
 * slice number (say 60) inside the image on screen, which holds that one slice only, so it found
 * nothing and drew no text. Where the image has one slice, read that slice. Cornerstone's
 * installed code is changed in place (it is not in OHIF's own source, which the patches change);
 * the build stops if the line is no longer there, so a new version is looked at again.
 */
function fixProbe() {
  const file = path.join(
    work,
    'node_modules/@cornerstonejs/tools/dist/esm/tools/annotation/ProbeTool.js',
  );
  const before = 'value = voxelManager?.getAtIJKPoint(ijk);';
  const after =
    'value = voxelManager?.getAtIJKPoint(dimensions?.[2] === 1 ? [ijk[0], ijk[1], 0] : ijk);';
  const code = readFileSync(file, 'utf8');
  if (code.includes(after)) return;
  if (code.split(before).length !== 3) {
    throw new Error('ProbeTool.js changed: look at the Probe value fix in build.mjs again');
  }
  writeFileSync(file, code.replaceAll(before, after));
}
