import type { Interval } from '@nordurljos/core';
import { useClouds } from '../lib/api';
import { cloudFactor, hhmm, levelColor } from '../lib/explain';
import { Card } from './Card';
import { Freshness } from './Freshness';

const CONF_LABEL = {
  high: 'Sources agree',
  medium: 'Sources roughly agree',
  low: 'Sources disagree: low confidence',
  'single-source': 'One source only',
  none: 'No data',
} as const;

export function CloudCard({ q, darkIntervals }: { q: ReturnType<typeof useClouds>; darkIntervals: Interval[] }) {
  const d = q.data?.data;
  const f = cloudFactor(d?.effective ?? null);
  const fetched = q.data?.meta.sources.filter((s) => s.fetchedAt).map((s) => s.fetchedAt!).sort()[0];
  const stale = q.data?.meta.sources.some((s) => s.stale) ?? false;
  // Only a clear spell during darkness is useful for aurora.
  const inDark = (iso: string) => darkIntervals.some((iv) => iso >= iv.start && iso <= iv.end);
  const nextClear = d?.hourly.find((h) => new Date(h.time) > new Date() && inDark(h.time) && (h.total ?? 100) <= 30);
  const layers: [string, number | null | undefined, string][] = [
    ['Low', d?.current?.low, 'Thick, blocks everything'],
    ['Mid', d?.current?.mid, 'Usually blocks'],
    ['High', d?.current?.high, 'Often thin, aurora can shine through'],
  ];
  return (
    <Card title="Clouds here" right={<Freshness at={fetched} stale={stale} warnMin={30} />}>
      {q.isError && !d ? (
        <p className="text-bad">Cloud data unavailable. Check the signal; we'll retry automatically.</p>
      ) : (
        <>
          <div className="flex items-end gap-4">
            <div>
              <div className={`text-5xl font-bold tabular-nums ${levelColor[f.level]}`}>{f.value}</div>
              <div className="text-xs text-muted">sky blocked</div>
            </div>
            <ul className="flex-1 space-y-1.5">
              {layers.map(([name, v, hint]) => (
                <li key={name} title={hint}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">{name}</span>
                    <span className="tabular-nums">{v == null ? '—' : `${v}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2">
                    <div className="h-1.5 rounded-full bg-muted" style={{ width: `${v ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-sm text-muted">{f.sentence}</p>
          {nextClear && (d?.effective ?? 0) > 30 && (
            <p className="mt-1 text-sm text-good">Forecast: a clear spell after dark around {hhmm(nextClear.time)} ({nextClear.total}% cloud).</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {d && <span>{CONF_LABEL[d.confidence]}{d.spread !== null ? ` (±${d.spread}%)` : ''}</span>}
            {d?.weather?.temperature != null && (
              <span>
                {Math.round(d.weather.temperature)}°C
                {d.weather.feelsLike != null && ` (feels ${Math.round(d.weather.feelsLike)}°)`}
              </span>
            )}
            {d?.weather?.windSpeed != null && (
              <span className={d.weather.windGust != null && d.weather.windGust >= 20 ? 'text-ok' : ''}>
                Wind {Math.round(d.weather.windSpeed)} m/s
                {d.weather.windGust != null && `, gusts ${Math.round(d.weather.windGust)}`}
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
