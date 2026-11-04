/** Server-rendered internal validation dashboard (no client JS; behind ADMIN_TOKEN). */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function renderAdmin(r: any, beta: { notes: any[]; token: string } = { notes: [], token: '' }): string {
  const cal = r.calibration;
  const bt = r.backtest as any;
  const bar = (v: number | null) => (v == null ? '—' : `<span class="bar" style="width:${Math.round(v * 100)}%"></span> ${Math.round(v * 100)}%`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Norðurljós · score validation</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#02040a;color:#eef3fb;font:15px/1.5 -apple-system,Inter,system-ui,sans-serif;padding:24px 16px;max-width:980px;margin:auto}
h1{font-weight:300;font-size:30px;margin:0 0 4px}h2{font-weight:500;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#a6adbb;margin:32px 0 8px}
.card{background:rgb(255 255 255/.06);border-radius:20px;padding:16px 18px;box-shadow:inset 0 1px 0 rgb(255 255 255/.12)}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;text-align:left;border-bottom:1px solid rgb(255 255 255/.06);font-variant-numeric:tabular-nums}th{color:#a6adbb;font-weight:500}
.bar{display:inline-block;height:8px;border-radius:4px;background:#2dd4bf;vertical-align:middle;max-width:160px}.muted{color:#a6adbb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.big{font-size:32px;font-weight:300}code{background:rgb(255 255 255/.08);padding:2px 6px;border-radius:6px}
</style></head><body>
<h1>Score validation</h1><div class="muted">Generated ${esc(r.generatedAt)} · weights version <code>${esc(r.weights.version)}</code></div>
<h2>Overview</h2><div class="grid">
<div class="card"><div class="muted">Scores logged</div><div class="big">${esc(r.scoreLog.entries)}</div><div class="muted">since ${esc(r.scoreLog.since ?? '—')}</div></div>
<div class="card"><div class="muted">Outcomes ("did you see it?")</div><div class="big">${esc(r.outcomes.total)}</div><div class="muted">${esc(r.outcomes.withPrediction)} with a prediction</div></div>
<div class="card"><div class="muted">Brier score</div><div class="big">${esc(cal.brier ?? '—')}</div><div class="muted">lower is better · 0.25 = coin flip</div></div>
</div>
<h2>Calibration: predicted vs. actual</h2><div class="card"><table><tr><th>Score</th><th>Reports</th><th>Mean score</th><th>Actually saw it</th></tr>
${cal.buckets.map((b: any) => `<tr><td>${esc(b.range)}</td><td>${esc(b.n)}</td><td>${esc(b.meanScore ?? '—')}</td><td>${bar(b.sawRate)}</td></tr>`).join('')}
</table><p class="muted">A well-calibrated score has "saw it" rates rising steadily with the score. If 50–70 is seen 90% of the time, the score is too cautious; tune <code>config/score-weights.json</code>.</p></div>
<h2>Backtest (historical space weather)</h2><div class="card">${
    bt
      ? `<p class="muted">Run ${esc(bt.generatedAt)} · ${esc(bt.source)}</p><table><tr><th>Night</th><th>Kind</th><th>Place</th><th>Max Kp</th><th>Peak (clear sky)</th><th>Peak (with cloud)</th><th>Mean cloud</th></tr>${(bt.results ?? [])
          .map((x: any) => `<tr><td>${esc(x.date)}</td><td>${esc(x.kind)}</td><td>${esc(x.place)}</td><td>${esc(x.maxKp)}</td><td>${esc(x.peakClearSky)}</td><td>${esc(x.peakScore ?? '—')}</td><td>${esc(x.meanCloud ?? '—')}</td></tr>`)
          .join('')}</table><p>${esc(bt.summary ?? '')}</p>`
      : '<p class="muted">Not run yet. Run <code>npm run backtest</code> on the server.</p>'
  }</div>
<h2>Recent outcomes</h2><div class="card"><table><tr><th>Night</th><th>Cell</th><th>Saw</th><th>Predicted</th><th>From</th></tr>
${(r.outcomes.recent as any[]).map((o) => `<tr><td>${esc(o.night)}</td><td>${esc(o.lat)}, ${esc(o.lon)}</td><td>${o.saw ? 'yes' : 'no'}</td><td>${esc(o.predicted ?? '—')}</td><td class="muted">${esc(o.predictedFrom ?? '')}</td></tr>`).join('')}
</table></div>
<h2>Beta feedback (${beta.notes.length})</h2><div class="card">${
    beta.notes.length
      ? `<table><tr><th>When</th><th>Message</th><th>Screen</th><th>Version · device</th><th>Screenshot</th></tr>${beta.notes
          .slice(0, 100)
          .map((n: any) => `<tr><td class="muted">${esc(String(n.at).slice(0, 16).replace('T', ' '))}</td><td>${esc(n.message)}</td><td>${esc(n.screen)}</td><td class="muted">${esc(n.version)} · ${esc(n.device)}</td><td>${n.shot ? `<a href="/api/admin/beta-feedback/${esc(n.id)}/screenshot?token=${encodeURIComponent(beta.token)}">view</a>` : '—'}</td></tr>`)
          .join('')}</table>`
      : '<p class="muted">None yet. Testers send it from Settings → Send beta feedback.</p>'
  }</div>
<h2>Current weights</h2><div class="card"><pre>${esc(JSON.stringify(r.weights.weights, null, 2))}</pre></div>
</body></html>`;
}
