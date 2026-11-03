/**
 * Backtest the Aurora Score against real historical nights.
 *   npm run backtest                 # 2023–2025, Reykjavík + Akureyri
 *   BACKTEST_YEARS=2024 npm run backtest
 *
 * Space weather: NASA/GSFC OMNI2 hourly (real Kp, Bz GSM, solar-wind speed).
 * Cloud: Open-Meteo historical archive when available (rate-limited on shared IPs; nights
 * without cloud history are reported as "clear-sky potential" only).
 * Nights are selected from the data: dark-season nights with max Kp ≥ 7 vs. an equal number with max Kp ≤ 2.
 * Output: DATA_DIR/backtest/report.{json,md} (shown on /admin).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backtestNight, parseOmni2, resolveWeights, selectNights, effectiveCloud, type BacktestResult } from '@nordurljos/core';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const OUT = join(DATA, 'backtest');
const YEARS = (process.env.BACKTEST_YEARS ?? '2023,2024,2025').split(',').map((y) => y.trim());
const PLACES = [
  { name: 'Reykjavík', lat: 64.15, lon: -21.94 },
  { name: 'Akureyri', lat: 65.69, lon: -18.13 },
];
const UA = 'nordurljos-backtest/1.0 (+https://github.com/fragments8764/ClaudeCode)';
mkdirSync(OUT, { recursive: true });

async function cached(file: string, url: string): Promise<string | null> {
  const p = join(OUT, file);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) {
      console.warn(`  ${r.status} ${url.slice(0, 90)}`);
      return null;
    }
    const t = await r.text();
    writeFileSync(p, t);
    return t;
  } catch (e) {
    console.warn(`  failed ${url.slice(0, 90)}: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const w = JSON.parse(readFileSync(join(ROOT, 'config', 'score-weights.json'), 'utf8'));
  const weights = resolveWeights(w.weights);
  console.log(`Weights ${w.version}; years ${YEARS.join(', ')}`);
  const omniText: string[] = [];
  for (const y of YEARS) {
    const t = await cached(`omni2_${y}.dat`, `https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/omni2_${y}.dat`);
    if (t) omniText.push(t);
  }
  const omni = parseOmni2(omniText.join('\n'));
  if (!omni.length) throw new Error('No OMNI2 data available');
  const nights = selectNights(omni, { stormKp: 7, quietKp: 2, max: 8 });
  console.log(`${nights.length} nights selected from ${omni.length} hours`);

  const results: BacktestResult[] = [];
  let cloudHits = 0;
  for (const n of nights) {
    for (const place of PLACES) {
      const next = new Date(Date.parse(n.date) + 864e5).toISOString().slice(0, 10);
      const txt = await cached(
        `cloud_${place.name}_${n.date}.json`,
        `https://archive-api.open-meteo.com/v1/archive?latitude=${place.lat}&longitude=${place.lon}&start_date=${n.date}&end_date=${next}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&timezone=GMT`,
      );
      let cloud: Map<string, number> | null = null;
      try {
        const j = txt ? JSON.parse(txt) : null;
        if (j?.hourly?.time) {
          cloud = new Map();
          j.hourly.time.forEach((t: string, i: number) => {
            const e = effectiveCloud({ total: j.hourly.cloud_cover[i], low: j.hourly.cloud_cover_low[i], mid: j.hourly.cloud_cover_mid[i], high: j.hourly.cloud_cover_high[i] });
            if (e != null) cloud!.set(t.slice(0, 13), e);
          });
          cloudHits++;
        }
      } catch {
        cloud = null;
      }
      results.push(backtestNight(n, place, omni, cloud, weights));
    }
  }

  const storms = results.filter((r) => r.kind === 'storm');
  const quiet = results.filter((r) => r.kind === 'quiet');
  const mean = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const summary =
    `Clear-sky potential: storm nights average ${mean(storms.map((r) => r.peakClearSky))}, quiet nights ${mean(quiet.map((r) => r.peakClearSky))}. ` +
    `${storms.filter((r) => r.peakClearSky >= 50).length}/${storms.length} storm place-nights reach "Go" under clear skies; ` +
    `${quiet.filter((r) => r.peakClearSky < 30).length}/${quiet.length} quiet place-nights stay below 30. ` +
    `Cloud history available for ${cloudHits}/${results.length} place-nights` +
    (cloudHits ? `; with real cloud, storm nights average ${mean(storms.filter((r) => r.peakScore != null).map((r) => r.peakScore!))}.` : '.');
  const report = { generatedAt: new Date().toISOString(), weightsVersion: w.version, source: 'NASA/GSFC OMNI2 hourly; Open-Meteo historical archive', summary, results };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    `# Aurora Score backtest`,
    ``,
    `Generated ${report.generatedAt} · weights \`${w.version}\` · ${report.source}`,
    ``,
    summary,
    ``,
    `| Night | Kind | Place | Max Kp | Peak (clear sky) | Peak (with cloud) | Mean cloud |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...results.map((r) => `| ${r.date} | ${r.kind} | ${r.place} | ${r.maxKp} | ${r.peakClearSky} | ${r.peakScore ?? '—'} | ${r.meanCloud ?? '—'} |`),
  ].join('\n');
  writeFileSync(join(OUT, 'report.md'), md + '\n');
  console.log('\n' + md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
