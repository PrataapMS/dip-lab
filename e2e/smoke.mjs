// End-to-end smoke test against the production build (run `npm run build` first).
// Starts `vite preview`, drives a real Chrome and checks that a beginner can start a run and make
// a first trade, that the app makes no network calls beyond its own origin, and that it still
// loads offline once the service worker is installed.
//
// Needs playwright-core, which is not a dependency of the app:
//   npm i --no-save playwright-core@1.59 && npm run test:e2e
// Uses the installed Google Chrome; set E2E_CHANNEL=chromium to use a Playwright-managed browser.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4173;
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);

const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
context.on('request', (r) => {
  const url = r.url();
  if (!url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    problems.push(`network call outside the app: ${url}`);
  }
});

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
    throw new Error(`${name}: ${e.message}`);
  }
}

let failed = false;
try {
  await step('home loads', async () => {
    await page.goto(`${ORIGIN}/`);
    await page.getByRole('link', { name: 'learn' }).waitFor();
  });

  await step('service worker takes control', async () => {
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // The first install can reload the page (autoUpdate); start from a settled page.
    await page.reload();
    await page.getByRole('link', { name: 'learn' }).waitFor();
  });

  await step('start the first run', async () => {
    await page.locator('a[href="#/new"]').first().click();
    await page.getByRole('button', { name: /^Start / }).click();
    await page.waitForURL('**/#/market');
  });

  await step('buy $1,000 of AAPL', async () => {
    await page.goto(`${ORIGIN}/#/stock/AAPL`);
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await page.getByRole('button', { name: /^Buy \$1,000 of AAPL/ }).click();
    await page
      .getByText(/Bought [\d.]+ shares of AAPL/)
      .first()
      .waitFor();
  });

  await step('portfolio shows the holding', async () => {
    await page.goto(`${ORIGIN}/#/portfolio`);
    await page.waitForFunction(
      // biome-ignore lint/performance/useDomNodeTextContent: needs the rendered text with its spacing
      () => /AAPL\s+[\d.]+ sh\b/.test(document.body.innerText),
    );
  });

  await step('app loads offline', async () => {
    await context.setOffline(true);
    await page.goto(`${ORIGIN}/#/learn`);
    await page.reload();
    await page.getByRole('link', { name: 'home' }).waitFor();
    await context.setOffline(false);
  });

  if (problems.length) throw new Error(problems.join('\n'));
  console.log('e2e smoke test passed');
} catch (e) {
  failed = true;
  console.error(`::error::e2e smoke test failed\n${e.message}`);
  if (problems.length) console.error(problems.join('\n'));
} finally {
  await browser.close();
  preview.kill();
}
process.exit(failed ? 1 : 0);
