// Airplane-mode check against the production build (run `npm run build` first).
// Loads the app once online, waits until it is cached, then cuts the network and plays a full
// session: reload, start a run, buy, play a day, reload and resume, Settings, Learn, Badges and
// an export. Fails on any request that doesn't come from the service worker's cache, any failed
// request, and any page or console error.
//
// Needs playwright-core, which is not a dependency of the app:
//   npm i --no-save playwright-core@1.59 && node e2e/offline.mjs
// Uses the installed Google Chrome; set E2E_CHANNEL=chromium to use a Playwright-managed browser.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = 'e2e-results';

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
let previewExit = null;
preview.on('exit', (code) => {
  previewExit = code;
});
for (let waited = 0; ; waited += 250) {
  if (previewExit !== null) throw new Error(`vite preview exited with ${previewExit}`);
  if (waited > 30_000) throw new Error('vite preview did not start');
  const up = await fetch(ORIGIN).then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);

const problems = [];
let offline = false;
let requestsOffline = 0;
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
context.on('requestfailed', (r) => {
  if (offline) problems.push(`request failed offline: ${r.url()} (${r.failure()?.errorText})`);
});
context.on('response', (r) => {
  if (!offline) return;
  const url = r.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  requestsOffline++;
  // Requests made by the service worker itself are its cache lookups; pages must be served by it.
  if (!r.fromServiceWorker() && !r.request().serviceWorker())
    problems.push(`request went past the service worker offline: ${url}`);
});

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/offline-failure.png`, fullPage: true }).catch(() => {});
    throw new Error(`${name}: ${e.message}`);
  }
}

let failed = false;
try {
  await step('first visit online, app cached', async () => {
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.goto(`${ORIGIN}/#/settings`);
    await page.locator('[data-offline="ready"]').waitFor();
  });

  await step('airplane mode: reload', async () => {
    offline = true;
    await context.setOffline(true);
    await page.goto(`${ORIGIN}/#/home`);
    await page.reload();
    await page.getByRole('link', { name: 'learn' }).waitFor();
  });

  await step('start a run and buy', async () => {
    const skip = page.getByText('Skip, I know this');
    if (await skip.count()) await skip.click();
    await page.locator('a[href="#/new"]').first().click();
    await page.getByRole('button', { name: /^Start / }).click();
    await page.waitForURL('**/#/market');
    await page.goto(`${ORIGIN}/#/stock/AAPL`);
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await page.getByRole('button', { name: /^Buy \$1,000 of AAPL/ }).click();
    await page
      .getByText(/Bought [\d.]+ shares of AAPL/)
      .first()
      .waitFor();
  });

  await step('play a day', async () => {
    await page.goto(`${ORIGIN}/#/market`);
    await page.getByRole('button', { name: /Skip to/ }).click();
    await page.getByText(/16:00 ET/).waitFor();
  });

  await step('reload and resume the run', async () => {
    await page.reload();
    await page.goto(`${ORIGIN}/#/portfolio`);
    await page.waitForFunction(
      // biome-ignore lint/performance/useDomNodeTextContent: needs the rendered text with its spacing
      () => /AAPL\s+[\d.]+ sh\b/.test(document.body.innerText),
    );
  });

  await step('Settings, Learn and Badges open', async () => {
    await page.goto(`${ORIGIN}/#/settings`);
    await page.locator('[data-offline="ready"]').waitFor();
    await page.goto(`${ORIGIN}/#/learn`);
    await page
      .getByRole('heading', { name: /Lessons/i })
      .first()
      .waitFor();
    await page.goto(`${ORIGIN}/#/badges`);
    await page
      .getByText(/First trade/)
      .first()
      .waitFor();
  });

  await step('export a run', async () => {
    await page.goto(`${ORIGIN}/#/settings`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).first().click();
    const file = await download;
    if (!/^dip-lab-run-.*\.json$/.test(file.suggestedFilename()))
      throw new Error(`unexpected file ${file.suggestedFilename()}`);
  });

  await context.setOffline(false);
  offline = false;
  if (requestsOffline === 0) problems.push('no requests seen offline: the check did not run');
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`airplane-mode check passed (${requestsOffline} requests, all from the cache)`);
} catch (e) {
  failed = true;
  console.error(`::error::airplane-mode check failed\n${e.message}`);
  if (problems.length) console.error(problems.join('\n'));
} finally {
  await browser.close();
  preview.kill();
}
process.exit(failed ? 1 : 0);
