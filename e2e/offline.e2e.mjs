// End-to-end: the "Offline · data from HH:MM" badge (regression: flaky check).
// Needs a build (`npm run build`) and Playwright with Chromium (`npx playwright install chromium`
// on your machine). Run: `npm run e2e`.
// Root cause of the old flakiness: the perf script throttled the network through its own CDP
// session while Playwright toggled offline through another, so the two overwrote each other.
// This test uses only Playwright's context.setOffline, and its own server + data dir.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 8800 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['apps/server/dist/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'nl-e2e-')) }, stdio: 'ignore' });
const fail = (m) => {
  console.error('FAIL', m);
  server.kill();
  process.exit(1);
};
for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const rounds = Number(process.env.E2E_ROUNDS ?? 3);
const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});
for (let round = 1; round <= rounds; round++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('nordurljos-settings', JSON.stringify({ state: { onboarded: true, location: { lat: 64.1466, lon: -21.9426, label: 'Reykjavík', source: 'manual', at: new Date().toISOString() } }, version: 4 })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/tonight`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker, API responses get cached
  await page.waitForSelector('[aria-label^="Aurora score"]', { timeout: 20000 });
  await page.waitForFunction(() => /Aurora score \d+/.test(document.querySelector('[aria-label^="Aurora score"]')?.getAttribute('aria-label') ?? ''), null, { timeout: 30000 }).catch(() => {});
  if (await page.locator('text=/Offline · data from/').count()) fail(`round ${round}: badge visible while online`);
  await ctx.setOffline(true);
  await page.reload();
  try {
    await page.locator('text=/Offline · data from \\d\\d:\\d\\d/').waitFor({ timeout: 15000 });
  } catch {
    fail(`round ${round}: offline badge did not appear`);
  }
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.reload();
  try {
    await page.locator('text=/Offline · data from/').waitFor({ state: 'detached', timeout: 20000 });
  } catch {
    fail(`round ${round}: badge stuck after coming back online`);
  }
  console.log(`round ${round}: ok`);
  await ctx.close();
}
await browser.close();
server.kill();
console.log(`offline badge e2e: ${rounds}/${rounds} passed`);
