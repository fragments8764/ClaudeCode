import { motion } from 'motion/react';
import { Cloud, Gauge, Moon } from 'lucide-react';
import { Freshness } from '../components/Freshness';
import { NightTimeline } from '../components/NightTimeline';
import { spring, springSoft } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { bzFactor, cloudFactor, kpFactor, levelColor, moonFactor, speedFactor } from '../lib/explain';
import { displayTimeZone, hhmm, temp, timeZoneDiffers, whenDay, wind } from '../lib/format';
import { useReducedMotionPref, useSettings } from '../lib/store';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';
import { ChartSection, KpChart } from './MetricSheets';

const CONF: Record<string, string> = {
  high: 'Two forecasts agree',
  medium: 'Forecasts roughly agree',
  low: 'Forecasts disagree',
  'single-source': 'One forecast available',
  none: 'No forecast',
};

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[14px] text-ink-2">{k}</span>
      <span className={`min-w-0 text-right text-[15px] font-medium tabular-nums ${tone ?? ''}`}>{v}</span>
    </div>
  );
}

/** Animated mist gauge: a rounded vessel that fills with cloud. */
function CloudGauge({ pct }: { pct: number | null }) {
  const reduced = useReducedMotionPref();
  const v = pct ?? 0;
  return (
    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[32px] bg-[rgb(255_255_255/0.05)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]" aria-hidden>
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ background: 'linear-gradient(to top, rgb(203 213 225 / 0.55), rgb(203 213 225 / 0.18))' }}
        initial={reduced ? false : { height: '0%' }}
        animate={{ height: `${v}%` }}
        transition={springSoft}
      >
        {!reduced && (
          <motion.div
            className="absolute -top-3 left-0 h-6 w-[200%] rounded-[50%] bg-[rgb(203_213_225/0.35)] blur-md"
            animate={{ x: ['-50%', '0%'] }}
            transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
          />
        )}
      </motion.div>
      <div className="relative grid h-full place-items-center font-display text-3xl font-light tabular-nums">{pct == null ? '—' : `${Math.round(v)}%`}</div>
    </div>
  );
}

export function CloudSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const units = useSettings((s) => s.units);
  const d = c.clouds.data?.data;
  const f = cloudFactor(d?.effective ?? null);
  const fetched = c.clouds.data?.meta.sources.map((s) => s.fetchedAt).filter(Boolean).sort()[0];
  const inDark = (iso: string) => c.plan.darkIntervals.some((iv) => iso >= iv.start && iso <= iv.end);
  const nextClear = d?.hourly.find((h) => new Date(h.time) > c.now && inDark(h.time) && (h.total ?? 100) <= 30);
  const hours = (d?.hourly ?? []).filter((h) => new Date(h.time).getTime() >= c.now.getTime() - 3.6e6).slice(0, 24);
  return (
    <Sheet open={open} onClose={onClose} title="Clouds" header={<StatHeader id="cloud" icon={Cloud} label="Cloud cover here" value={f.value} tone={levelColor[f.level]} />}>
      <div className="flex items-center gap-5">
        <CloudGauge pct={d?.effective ?? null} />
        <div className="flex-1 space-y-2.5">
          {(
            [
              ['Low', d?.current?.low, 'blocks everything'],
              ['Mid', d?.current?.mid, 'usually blocks'],
              ['High', d?.current?.high, 'thin — aurora shines through'],
            ] as const
          ).map(([n, v, hint]) => (
            <div key={n}>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-2">
                  {n} <span className="text-ink-3">· {hint}</span>
                </span>
                <span className="tabular-nums">{v == null ? '—' : `${Math.round(v)}%`}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-[rgb(255_255_255/0.08)]">
                <motion.div className="h-1 rounded-full bg-[rgb(203_213_225/0.6)]" initial={{ width: 0 }} animate={{ width: `${v ?? 0}%` }} transition={spring} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {d?.fallback && <p className="mt-4 rounded-[var(--r-md)] bg-[rgb(250_204_21/0.1)] p-3 text-[13px] text-fair">{d.fallback}.</p>}
      <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{f.sentence}</p>
      {nextClear && (d?.effective ?? 0) > 30 && (
        <p className="mt-2 text-[15px] text-good">Clear spell after dark around {whenDay(nextClear.time, c.now)}.</p>
      )}

      {d?.observed && (
        <p className="mt-3 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-3 text-[13px] text-ink-2">
          The two forecasts disagreed, so we checked the real sky: the {d.observed.name} cloud sensor ({d.observed.distanceKm} km away) sees about {d.observed.percent}% cloud, so this uses the {d.observed.picked === 'open-meteo' ? 'Open-Meteo' : 'MET Norway'} forecast.
        </p>
      )}

      <ChartSection
        title="Next 24 hours"
        points={hours.map((h) => ({ t: Date.parse(h.time), v: h.total }))}
        now={c.now}
        fmt={(v) => String(Math.round(v))}
        unit="%"
        min={0}
        max={100}
        color="rgb(203 213 225)"
        bands={c.plan.darkIntervals.map((iv) => [Date.parse(iv.start), Date.parse(iv.end)] as [number, number])}
        thresholds={[{ v: 30, label: 'Clear enough' }]}
        hint={(v) => (v <= 30 ? 'Clear enough to see aurora' : v <= 70 ? 'Partly cloudy: look for gaps' : 'Overcast')}
      />
      <p className="mt-2 text-[12px] text-ink-3">Shaded bands are the dark hours.</p>

      <div className="mt-6 divide-y divide-[rgb(255_255_255/0.06)]">
        <Row k="Confidence" v={d ? `${CONF[d.confidence]}${d.spread != null ? ` (±${d.spread}%)` : ''}` : '—'} />
        <Row k="Temperature" v={`${temp(d?.weather?.temperature, units)}${d?.weather?.feelsLike != null ? ` · feels ${temp(d.weather.feelsLike, units)}` : ''}`} />
        <Row k="Wind" v={`${wind(d?.weather?.windSpeed, units)}${d?.weather?.windGust != null ? ` · gusts ${wind(d.weather.windGust, units)}` : ''}`} tone={(d?.weather?.windGust ?? 0) >= 20 ? 'text-fair' : undefined} />
      </div>
      <div className="mt-3">
        <Freshness at={fetched} warnMin={30} />
      </div>
    </Sheet>
  );
}

export function ActivitySheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const d = c.sw.data?.data;
  const a = c.aurora.data?.data;
  const kp = kpFactor(d?.kp.now?.kp ?? null);
  const bz = bzFactor(d?.solarWind.bzAvg15m ?? d?.solarWind.latest?.bz ?? null);
  const sp = speedFactor(d?.solarWind.latest?.speed);
  return (
    <Sheet open={open} onClose={onClose} title="Activity" header={<StatHeader id="activity" icon={Gauge} label="Geomagnetic activity" value={d?.kp.now ? `Kp ${d.kp.now.kp.toFixed(1)}` : '—'} tone={levelColor[kp.level]} />}>
      <p className="text-[15px] leading-relaxed text-ink-2">{kp.sentence}</p>
      <div className="mt-4 divide-y divide-[rgb(255_255_255/0.06)]">
        <Row k="Aurora overhead (OVATION)" v={a ? `${a.overhead}%` : '—'} />
        <Row k="Aurora within view" v={a ? `${a.visible}%` : '—'} />
        <Row k="Bz (15 min)" v={bz.value} tone={levelColor[bz.level]} />
        <Row k="Solar wind" v={sp.value} tone={levelColor[sp.level]} />
        <Row k="Next 24 h peak" v={d?.kp.max24h ? `Kp ${d.kp.max24h.kp.toFixed(1)} · ${hhmm(d.kp.max24h.time)}` : '—'} />
      </div>
      <ul className="mt-5 space-y-2 text-[14px] leading-relaxed text-ink-2">
        <li>{bz.sentence}</li>
        <li>{sp.sentence}</li>
        <li>OVATION is NOAA's 30–90 min model of where aurora is right now. "Within view" counts aurora up to ~800 km away, low on the horizon.</li>
      </ul>
      <KpChart c={c} />
      <p className="mt-3 pb-4 text-[12px] text-ink-3">Tap Bz, solar wind or density on the Space tab for their own charts.</p>
    </Sheet>
  );
}

export function MoonSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const m = c.plan.moon;
  const f = moonFactor(m.illumination, m.altitudeDeg);
  const p = c.plan;
  const place = useSettings((s) => s.location.label);
  return (
    <Sheet open={open} onClose={onClose} title="Moon & darkness" header={<StatHeader id="moon" icon={Moon} label={m.phaseName} value={`${Math.round(m.illumination * 100)}% lit`} />}>
      <p className="text-[15px] leading-relaxed text-ink-2">{f.sentence}</p>
      <div className="mt-4 grid grid-cols-3 gap-y-4">
        {(
          [
            ['Sunset', hhmm(p.sunset)],
            ['Dark from', p.darkNow ? 'Now' : hhmm(p.darkStart)],
            ['Dark until', hhmm(p.darkEnd)],
            ['Moonrise', hhmm(p.moonrise)],
            ['Moonset', hhmm(p.moonset)],
            ['Sunrise', hhmm(p.sunrise)],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
            <div className="font-display text-xl font-light tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <NightTimeline plan={p} clouds={c.clouds.data?.data.hourly ?? []} illumination={m.illumination} />
      </div>
      <p className="mt-4 text-[12px] text-ink-3">
        Worked out on your phone, so it works offline. Moon times match the US Naval Observatory to within a minute.
        {timeZoneDiffers() && ` Times are local to ${place} (${displayTimeZone()}).`}
      </p>
    </Sheet>
  );
}
