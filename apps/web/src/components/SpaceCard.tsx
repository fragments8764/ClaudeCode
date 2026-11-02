import { useSpaceWeather } from '../lib/api';
import { bzFactor, hhmm, kpFactor, levelColor, speedFactor } from '../lib/explain';
import { Card } from './Card';
import { Freshness } from './Freshness';

/** Compact space-weather tiles. The full dashboard (graphs, X-ray, CMEs, 27-day) comes in a later phase. */
export function SpaceCard({ q }: { q: ReturnType<typeof useSpaceWeather> }) {
  const d = q.data?.data;
  const kp = kpFactor(d?.kp.now?.kp ?? null);
  const bz = bzFactor(d?.solarWind.latest?.bz ?? null);
  const sp = speedFactor(d?.solarWind.latest?.speed);
  const max = d?.kp.max24h;
  const stale = q.data?.meta.sources.some((s) => s.stale) ?? false;
  const bzSeries = (d?.solarWind.mag6h ?? []).slice(-36); // last ~3 h in 5-min buckets

  return (
    <Card title="Space weather" right={<Freshness at={d?.solarWind.latest?.time} stale={stale} warnMin={10} label="L1 data" />}>
      {q.isError && !d ? (
        <p className="text-bad">Space-weather feed unavailable. Retrying.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Kp now" value={d?.kp.now ? d.kp.now.kp.toFixed(1) : '—'} cls={levelColor[kp.level]} sub={d?.kp.gScaleNow ? `G${d.kp.gScaleNow} storm` : d?.kp.now?.kind} />
            <Tile label="Bz (nT)" value={bz.value.replace(' nT', '')} cls={levelColor[bz.level]} sub={d?.solarWind.bzAvg15m != null ? `15 min avg ${d.solarWind.bzAvg15m.toFixed(1)}` : undefined} />
            <Tile label="Wind (km/s)" value={sp.value.replace(' km/s', '')} cls={levelColor[sp.level]} sub={`density ${d?.solarWind.latest?.density?.toFixed(1) ?? '—'}/cm³`} />
          </div>
          {bzSeries.length > 2 && <BzSpark points={bzSeries.map((p) => p.bz)} />}
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>{bz.sentence}</li>
            <li>{kp.sentence}</li>
            {max && (
              <li>
                Next 24 h peak: <span className="font-semibold text-fg">Kp {max.kp.toFixed(1)}</span> around {hhmm(max.time)}
                {d?.kp.gScaleMax24h ? ` (G${d.kp.gScaleMax24h} watch)` : ''}.
              </li>
            )}
          </ul>
          {d?.solarWind.spacecraft && <p className="mt-2 text-xs text-muted">Solar wind measured by {d.solarWind.spacecraft} at L1, about 30–60 min upstream of Earth.</p>}
        </>
      )}
    </Card>
  );
}

function Tile({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** Tiny Bz sparkline, zero line marked; south (negative) is filled in accent. */
function BzSpark({ points }: { points: (number | null)[] }) {
  const vals = points.map((v) => v ?? 0);
  const lim = Math.max(5, ...vals.map(Math.abs));
  const W = 300;
  const H = 48;
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (v: number) => H / 2 - (v / lim) * (H / 2 - 2);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <figure className="mt-3" aria-label="Bz over the last 3 hours; below the line means south">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none">
        <defs>
          <clipPath id="south"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        <path d={`${d} L${W},${H / 2} L0,${H / 2} Z`} fill="var(--accent)" opacity="0.35" clipPath="url(#south)" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--border)" strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted">
        <span>Bz, last 3 h</span>
        <span>below line = south (good)</span>
      </figcaption>
    </figure>
  );
}
