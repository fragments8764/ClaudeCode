import { darknessFactor, type CloudLayers, type NightPlan } from '@nordurljos/core';
import { hhmm } from '../lib/explain';

const HOURS = 18;

/** Horizontal timeline: sky brightness, moon-up and hourly cloud cover for the next 18 h. */
export function NightTimeline({ plan, clouds, illumination }: { plan: NightPlan; clouds: CloudLayers[]; illumination: number }) {
  const start = new Date(plan.from).getTime();
  const end = start + HOURS * 3.6e6;
  const pct = (iso: string) => ((new Date(iso).getTime() - start) / (end - start)) * 100;
  const samples = plan.samples.filter((s) => new Date(s.time).getTime() <= end).filter((_, i) => i % 3 === 0);

  const sky = `linear-gradient(to right, ${samples
    .map((s) => {
      const light = 1 - darknessFactor(s.sunAlt);
      return `color-mix(in srgb, var(--muted) ${Math.round(light * 75)}%, var(--surface-2)) ${pct(s.time).toFixed(1)}%`;
    })
    .join(', ')})`;

  const moon = `linear-gradient(to right, ${samples
    .map((s) => `color-mix(in srgb, var(--accent-2) ${s.moonAlt > 0 ? Math.round(25 + illumination * 60) : 0}%, transparent) ${pct(s.time).toFixed(1)}%`)
    .join(', ')})`;

  const ticks: number[] = [];
  const firstTick = Math.ceil(start / (3 * 3.6e6)) * 3 * 3.6e6;
  for (let t = firstTick; t < end; t += 3 * 3.6e6) ticks.push(t);

  const cloudCols = clouds.filter((c) => {
    const t = new Date(c.time).getTime();
    return t >= start - 3.6e6 && t < end;
  });

  return (
    <figure aria-label="Timeline for the next 18 hours: darkness, moon and cloud cover">
      <div className="relative space-y-1.5">
        <Row label="Sky">
          <div className="h-7 rounded-lg" style={{ background: sky }} />
          {plan.darkIntervals.map((iv) => {
            const l = Math.max(0, pct(iv.start));
            const r = Math.min(100, pct(iv.end));
            return r > l ? (
              <div key={iv.start} className="absolute inset-y-0 rounded-lg border-2 border-accent/70" style={{ left: `${l}%`, width: `${r - l}%` }} title={`Dark ${hhmm(iv.start)}–${hhmm(iv.end)}`} />
            ) : null;
          })}
        </Row>
        <Row label="Moon">
          <div className="h-3 rounded-full" style={{ background: moon }} />
        </Row>
        <Row label="Cloud">
          <div className="flex h-8 items-end">
            {cloudCols.map((c) => {
              const l = Math.max(0, pct(c.time));
              const w = (3.6e6 / (end - start)) * 100;
              return (
                <div
                  key={c.time}
                  className="absolute bottom-0 rounded-sm bg-muted/60"
                  style={{ left: `${l}%`, width: `calc(${Math.min(w, 100 - l)}% - 1px)`, height: `${Math.max(4, c.total ?? 0)}%` }}
                  title={`${hhmm(c.time)}: ${c.total ?? '?'}% cloud`}
                />
              );
            })}
          </div>
        </Row>
        <div className="relative ml-12 h-4 text-[11px] text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(new Date(t).toISOString())}%` }}>
              {hhmm(new Date(t).toISOString())}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm border-2 border-accent/70 align-middle" />dark enough (sun &lt; −12°)</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-accent-2/70 align-middle" />moon up</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-muted/60 align-middle" />cloud %</span>
      </figcaption>
    </figure>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}
