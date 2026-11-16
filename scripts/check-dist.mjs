// Checks the production build: the PWA files exist and the app stays within its size budget.
// Everything in dist/ is precached for offline play, so its size is the first-load download.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET = {
  totalKb: 1500, // everything in dist/
  jsGzipKb: 150, // all JavaScript, gzipped
};
const REQUIRED = ['index.html', 'sw.js', 'manifest.webmanifest', 'sw-update.js'];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const errors = [];
for (const f of REQUIRED) {
  if (!existsSync(join(DIST, f))) errors.push(`missing ${DIST}/${f}`);
}

const all = files(DIST);
const totalKb = all.reduce((sum, f) => sum + statSync(f).size, 0) / 1024;
const js = all
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: relative(DIST, f), gzipKb: gzipSync(readFileSync(f)).length / 1024 }))
  .sort((a, b) => b.gzipKb - a.gzipKb);
const jsGzipKb = js.reduce((sum, f) => sum + f.gzipKb, 0);

if (totalKb > BUDGET.totalKb) {
  errors.push(`dist is ${totalKb.toFixed(0)} KB, budget ${BUDGET.totalKb} KB`);
}
if (jsGzipKb > BUDGET.jsGzipKb) {
  errors.push(`JS is ${jsGzipKb.toFixed(1)} KB gzipped, budget ${BUDGET.jsGzipKb} KB`);
}

const report = [
  '### Build size',
  '| | size | budget |',
  '|---|---|---|',
  `| dist total | ${totalKb.toFixed(0)} KB | ${BUDGET.totalKb} KB |`,
  `| JS gzipped | ${jsGzipKb.toFixed(1)} KB | ${BUDGET.jsGzipKb} KB |`,
  ...js.slice(0, 5).map((f) => `| ${f.file} | ${f.gzipKb.toFixed(1)} KB gz | |`),
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
