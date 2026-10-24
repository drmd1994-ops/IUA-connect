#!/usr/bin/env node
/**
 * Puts the built scan viewer (M36) where the site serves it, apps/web/public/viewer.
 *
 *   node apps/viewer/fetch.mjs            download the bundle named in bundle.json, if not there
 *   node apps/viewer/fetch.mjs --inputs   print the fingerprint of the viewer's sources
 *
 * The viewer is built by the "Viewer bundle" workflow (build.mjs) and attached to a GitHub
 * release; bundle.json names the release and the archive's SHA-256, and the download is refused
 * if it differs. bundle.json also records the fingerprint of the sources it was built from; when
 * the sources have changed since (a patch, the settings, a text), the bundle is out of date: that
 * fails a CI build, and only warns on a developer's machine.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = 'drmd1994-ops/IUA-connect';
/** What the bundle is built from. */
const SOURCES = ['build.mjs', 'ohif.json', 'app-config.js', 'patches', 'locales'];

/** The sources' fingerprint; line endings are ignored, so Windows and Linux checkouts agree. */
export function inputsHash() {
  const hash = createHash('sha256');
  const files = SOURCES.flatMap((name) => walk(path.join(here, name))).sort();
  for (const file of files) {
    hash.update(path.relative(here, file).replaceAll('\\', '/'));
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex');
}

function walk(target) {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target).flatMap((name) => walk(path.join(target, name)));
}

async function main() {
  if (process.argv.includes('--inputs')) {
    console.log(inputsHash());
    return;
  }
  const bundle = JSON.parse(readFileSync(path.join(here, 'bundle.json'), 'utf8'));
  const outDir = path.resolve(here, '../web/public/viewer');
  const marker = path.join(outDir, '.bundle-sha256');

  if (bundle.inputs !== inputsHash()) {
    const message =
      'The viewer bundle is older than its sources (apps/viewer). Run the "Viewer bundle" workflow ' +
      'and put its result in apps/viewer/bundle.json.';
    if (process.env.CI) throw new Error(message);
    console.warn(`warning: ${message}`);
  }
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === bundle.sha256) return;

  const url = `https://github.com/${REPOSITORY}/releases/download/${bundle.release}/viewer.tar.gz`;
  console.log(`Downloading the scan viewer: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The viewer could not be downloaded (${response.status})`);
  const archive = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(archive).digest('hex');
  if (sha256 !== bundle.sha256) {
    throw new Error(`The viewer archive's SHA-256 is ${sha256}, expected ${bundle.sha256}`);
  }
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir))
    rmSync(path.join(outDir, name), { recursive: true, force: true });
  // Unpacked from inside the folder by a plain name: no drive letter for tar to misread.
  const file = path.join(outDir, 'viewer.tar.gz');
  writeFileSync(file, archive);
  execFileSync('tar', ['-xzf', 'viewer.tar.gz'], { cwd: outDir, stdio: 'inherit' });
  rmSync(file, { force: true });
  writeFileSync(marker, `${sha256}\n`);
  console.log(`The scan viewer is in ${outDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
