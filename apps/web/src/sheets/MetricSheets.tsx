import { motion } from 'motion/react';
import { Activity, Magnet, Sparkles, Wind as WindIcon, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { FactorKey } from '@nordurljos/core';
import { spring } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { bzFactor, levelColor, speedFactor } from '../lib/explain';
import { whenDay } from '../lib/format';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';
import { TimelineChart, type Threshold, type TPoint } from '../ui/TimelineChart';

/* ── shared building blocks (Apple-Weather-style detail) ─────────────────────── */

/** Readout + interactive chart + Now / High / Low. Dragging the chart updates the readout. */
export function ChartSection({
  title,
  points,
  now,
  fmt,
  unit = '',
  color,
  kind,
  min,
  max,
  thresholds,
  bands,
  hint,
}: {
  title: string;
  points: TPoint[];
  now: Date;
  fmt: (v: number) => string;
  unit?: string;
  color?: string;
  kind?: 'line' | 'bars';
  min?: number;
  max?: number;
  thresholds?: Threshold[];
  bands?: [number, number][];
  hint?: (v: number) => string;
}) {
  const [sel, setSel] = useState<TPoint | null>(null);
  const nowMs = now.getTime();
  const current = [...points].reverse().find((p) => p.t <= nowMs && p.v != null) ?? points.find((p) => p.v != null);
  const shown = sel?.v != null ? sel : current;
  const valid = points.filter((p): p is { t: number; v: number } => p.v != null);
  const hi = valid.length ? valid.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const lo = valid.length ? valid.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const when = (t: number) => (Math.abs(t - nowMs) < 30 * 60_000 ? 'now' : whenDay(new Date(t).toISOString(), now));
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">{title}</h3>
      <div className="rounded-[var(--r-lg)] bg-[rgb(255_255_255/0.04)] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
        <div className="mb-3 flex items-baseline justify-between gap-3" aria-live="polite">
          <div className="min-w-0">
            <div className="text-[12px] text-ink-3">{shown ? (sel ? when(shown.t) : 'Now') : '—'}</div>
            <div className="font-display text-[30px] font-light leading-none tabular-nums">
              {shown?.v != null ? fmt(shown.v) : '—'}
              {unit && <span className="ml-1 text-[15px] text-ink-2">{unit}</span>}
            </div>
          </div>
          {shown?.v != null && hint && <div className="max-w-[55%] text-right text-[13px] leading-snug text-ink-2">{hint(shown.v)}</div>}
        </div>
        <TimelineChart points={points} now={nowMs} color={color} kind={kind} min={min} max={max} thresholds={thresholds} bands={bands} fmt={fmt} label={title} onSelect={setSel} />
        {hi && lo && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <div className="text-ink-3">Highest</div>
              <div className="tabular-nums">
                {fmt(hi.v)}
                {unit} · {when(hi.t)}
              </div>
            </div>
            <div>
              <div className="text-ink-3">Lowest</div>
              <div className="tabular-nums">
                {fmt(lo.v)}
                {unit} · {when(lo.t)}
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-ink-3">Drag across the chart to read any time.</p>
      </div>
    </section>
  );
}

/** Plain-English Q&A at the bottom of a detail sheet. */
export function About({ items }: { items: [string, ReactNode][] }) {
  return (
    <section className="mt-7 pb-6">
      <h3 className="mb-1 text-[11px] uppercase tracking-[0.22em] text-ink-3">About</h3>
      <dl className="divide-y divide-[rgb(255_255_255/0.06)]">
        {items.map(([q, a]) => (
          <div key={q} className="py-3">
            <dt className="text-[15px] font-medium">{q}</dt>
            <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const darkBands = (c: Conditions): [number, number][] => c.plan.darkIntervals.map((iv) => [Date.parse(iv.start), Date.parse(iv.end)]);

/* ── Aurora Score: "Why this score?" ─────────────────────────────────────────── */

const FACTOR_HELP: Record<FactorKey, (v: number) => string> = {
  activity: (v) => (v >= 0.7 ? 'Strong space weather.' : v >= 0.4 ? 'Some activity: a glow or arc is possible.' : 'Quiet sun: aurora will be faint or absent.'),
  sky: (v) => (v >= 0.8 ? 'Clear sky.' : v >= 0.4 ? 'Some cloud: look for gaps.' : 'Mostly cloudy here.'),
  dark: (v) => (v >= 0.95 ? 'Fully dark.' : v >= 0.6 ? 'Dark enough.' : v >= 0.2 ? 'Twilight: only bright aurora shows.' : 'Daylight.'),
  moon: (v) => (v >= 0.9 ? 'Moon is no problem.' : v >= 0.6 ? 'Some moonlight washes out faint aurora.' : 'Bright moon: only strong aurora stands out.'),
};

export function ScoreSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const s = c.score;
  // The hourly outlook can only use forecast inputs; "now" must be the live score shown on
  // Tonight (which also uses OVATION and the real-time solar wind), or the two disagree.
  const points = useMemo(() => {
    const nowMs = c.now.getTime();
    const future = c.outlook.map((h) => ({ t: Date.parse(h.time), v: h.score as number | null })).filter((p) => p.t > nowMs);
    return s ? [{ t: nowMs, v: s.score }, ...future] : future;
  }, [c.outlook, c.now, s]);
  const order: FactorKey[] = ['activity', 'sky', 'dark', 'moon'];
  return (
    <Sheet open={open} onClose={onClose} title="Aurora Score" initial="full" detents={['half', 'full']} header={<StatHeader id="score" icon={Sparkles} label="Why this score?" value={s ? `${s.score} of 100` : '—'} />}>
      <p className="text-[15px] leading-relaxed text-ink-2">
        One number for "should I go out?". It multiplies four things, so any one of them can hold it down.
        {s?.limitingLabel ? ` Right now the biggest drag is ${s.limitingLabel.toLowerCase()}.` : ' Nothing is holding it back right now.'}
      </p>
      <ul className="mt-5 space-y-4">
        {order.map((k) => {
          const v = s?.factors[k] ?? 0;
          const lim = s?.limiting === k;
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span className={lim ? 'font-medium text-fair' : ''}>
                  {k === 'activity' ? 'Aurora activity' : k === 'sky' ? 'Clear sky' : k === 'dark' ? 'Darkness' : 'Moon'}
                  {lim && ' · holding it back'}
                </span>
                <span className="tabular-nums text-ink-2">{Math.round(v * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[rgb(255_255_255/0.08)]">
                <motion.div className="h-1.5 rounded-full" style={{ background: lim ? 'var(--c-fair, #facc15)' : 'rgb(var(--aurora-rgb))' }} initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={spring} />
              </div>
              <p className="mt-1 text-[13px] text-ink-3">{FACTOR_HELP[k](v)}</p>
            </li>
          );
        })}
      </ul>
      {s && (
        <p className="mt-4 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.04)] p-3 text-[13px] tabular-nums text-ink-2">
          100 × {order.map((k) => s.factors[k].toFixed(2)).join(' × ')} = <span className="font-medium text-ink">{s.score}</span>
          {s.missing.length > 0 && <span className="block pt-1 text-ink-3">Some inputs were missing and assumed: {s.missing.join(', ')}.</span>}
        </p>
      )}
      <ChartSection
        title="Score through the night"
        points={points}
        now={c.now}
        fmt={(v) => String(Math.round(v))}
        min={0}
        max={100}
        bands={darkBands(c)}
        color="rgb(var(--aurora-rgb))"
        thresholds={[
          { v: 50, label: 'Go' },
          { v: 30, label: 'Worth a look' },
        ]}
        hint={(v) => (v >= 50 ? 'Go outside' : v >= 30 ? 'Worth a look' : v >= 12 ? 'Possible' : 'Unlikely')}
      />
      <About
        items={[
          ['How is it worked out?', 'Activity comes from NOAA (Kp, the OVATION aurora model, and the solar wind). Clouds come from two weather models, checked against Icelandic Met Office observations. Darkness and the moon are worked out on your phone.'],
          ['Why can it change fast?', 'The solar wind takes 30–60 minutes to arrive, and a southward Bz can start a substorm within minutes. Clouds move too. The app refreshes every few minutes.'],
          ['Is it accurate?', 'In a backtest on real storm and quiet nights, clear storm nights averaged 77 and quiet nights 14. It is a guide, not a guarantee. Aurora is never certain.'],
          ['What do the shaded bands mean?', 'Darkness: the hours when the sky is dark enough to see aurora.'],
        ]}
      />
    </Sheet>
  );
}

/* ── Solar wind: Bz, speed, density ──────────────────────────────────────────── */

function SolarSheet({
  c,
  open,
  onClose,
  id,
  icon,
  label,
  value,
  tone,
  intro,
  chart,
  about,
}: {
  c: Conditions;
  open: boolean;
  onClose: () => void;
  id: string;
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: string;
  intro: string;
  chart: Omit<Parameters<typeof ChartSection>[0], 'now'>;
  about: [string, ReactNode][];
}) {
  const sc = c.sw.data?.data.solarWind.spacecraft;
  return (
    <Sheet open={open} onClose={onClose} title={label} initial="full" detents={['half', 'full']} header={<StatHeader id={id} icon={icon} label={label} value={value} tone={tone} />}>
      <p className="text-[15px] leading-relaxed text-ink-2">{intro}</p>
      <ChartSection {...chart} now={c.now} />
      <About items={[...about, ['Where does this come from?', `${sc ? `NOAA's real-time feed from ${sc}` : 'NOAA real-time solar wind'}, a spacecraft about 1.5 million km towards the Sun. What it measures reaches Earth 30–60 minutes later.`]]} />
    </Sheet>
  );
}

export function BzSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const d = c.sw.data?.data.solarWind;
  const bz = bzFactor(d?.latest?.bz ?? null);
  const points = useMemo(() => (d?.mag6h ?? []).map((p) => ({ t: Date.parse(p.time), v: p.bz })), [d?.mag6h]);
  return (
    <SolarSheet
      c={c}
      open={open}
      onClose={onClose}
      id="bz"
      icon={Magnet}
      label="Bz"
      value={bz.value}
      tone={levelColor[bz.level]}
      intro={bz.sentence}
      chart={{
        title: 'Last 6 hours',
        points,
        fmt: (v) => v.toFixed(1),
        unit: ' nT',
        color: 'var(--c-violet)',
        thresholds: [
          { v: 0, label: 'North ↑ · South ↓' },
          { v: -5, label: 'Strongly south', color: 'rgb(74 222 128 / 0.5)' },
        ],
        hint: (v) => (v <= -5 ? 'Strongly south: the door is open' : v < 0 ? 'Tilting south: energy leaks in' : 'North: mostly shut'),
      }}
      about={[
        ['What is Bz?', 'The north–south direction of the magnetic field carried by the solar wind. When it points south (negative), it links up with Earth’s field and lets energy in. That is what powers bright aurora.'],
        ['What is good?', 'Below −5 nT for 15–30 minutes or more is promising, especially with fast solar wind. A sudden swing south often comes before a substorm (a burst of aurora).'],
      ]}
    />
  );
}

export function SpeedSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const d = c.sw.data?.data.solarWind;
  const sp = speedFactor(d?.latest?.speed);
  const points = useMemo(() => (d?.wind6h ?? []).map((p) => ({ t: Date.parse(p.time), v: p.speed })), [d?.wind6h]);
  return (
    <SolarSheet
      c={c}
      open={open}
      onClose={onClose}
      id="speed"
      icon={WindIcon}
      label="Solar wind speed"
      value={sp.value}
      tone={levelColor[sp.level]}
      intro={sp.sentence}
      chart={{
        title: 'Last 6 hours',
        points,
        fmt: (v) => String(Math.round(v)),
        unit: ' km/s',
        color: 'var(--c-teal)',
        thresholds: [{ v: 500, label: 'Fast' }],
        hint: (v) => (v >= 600 ? 'Very fast' : v >= 500 ? 'Fast: helps a lot' : v >= 400 ? 'Normal' : 'Slow and calm'),
      }}
      about={[
        ['What is it?', 'How fast the stream of particles from the Sun is moving. Typical is 300–400 km/s. Fast streams from coronal holes or CMEs can top 600 km/s.'],
        ['Why does it matter?', 'Faster wind delivers more energy, but only if Bz is south as well. Fast wind with a northward Bz usually stays quiet.'],
      ]}
    />
  );
}

export function DensitySheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const d = c.sw.data?.data.solarWind;
  const points = useMemo(() => (d?.wind6h ?? []).map((p) => ({ t: Date.parse(p.time), v: p.density })), [d?.wind6h]);
  const now = d?.latest?.density;
  return (
    <SolarSheet
      c={c}
      open={open}
      onClose={onClose}
      id="density"
      icon={Activity}
      label="Density"
      value={now != null ? `${now.toFixed(1)}/cm³` : '—'}
      intro="How many particles are in the solar wind. A sudden jump often marks the front of a CME or a fast stream arriving."
      chart={{
        title: 'Last 6 hours',
        points,
        fmt: (v) => v.toFixed(1),
        unit: '/cm³',
        color: 'var(--c-emerald)',
        thresholds: [{ v: 10, label: 'Dense' }],
        hint: (v) => (v >= 20 ? 'Very dense: a shock may be arriving' : v >= 10 ? 'Dense' : 'Normal'),
      }}
      about={[
        ['What is normal?', 'About 2–10 particles per cubic centimetre. Above 10 is dense. A sharp jump together with a jump in speed is a classic CME arrival.'],
        ['Does density alone bring aurora?', 'No. It pushes harder on Earth’s field, which helps, but Bz and speed matter more.'],
      ]}
    />
  );
}

/** Kp chart for the Activity sheet (bars: 3-hour blocks; past solid, forecast lighter). */
export function KpChart({ c }: { c: Conditions }) {
  const s = c.sw.data?.data.kp.series ?? [];
  const points = useMemo(() => s.map((p) => ({ t: Date.parse(p.time), v: p.kp })), [s]);
  return (
    <ChartSection
      title="Kp · past day and next 3 days"
      points={points}
      now={c.now}
      kind="bars"
      fmt={(v) => v.toFixed(1)}
      min={0}
      max={9}
      color="var(--c-emerald)"
      thresholds={[
        { v: 5, label: 'Storm (G1+)' },
        { v: 3, label: 'Often visible in Iceland' },
      ]}
      hint={(v) => (v >= 7 ? 'Strong storm' : v >= 5 ? 'Storm' : v >= 4 ? 'Active' : v >= 3 ? 'Unsettled' : 'Quiet')}
    />
  );
}

