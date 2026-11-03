import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Freshness } from '../components/Freshness';
import { spring, STAGGER } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { useNowcast } from '../lib/api';
import { bzFactor, kpFactor, levelColor, speedFactor } from '../lib/explain';
import { hhmm } from '../lib/format';
import { Glass } from '../ui/Glass';
import { useT } from '../lib/i18n';
import { Sparkline } from '../ui/Sparkline';

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: spring } };

function Metric({ title, value, tone, caption, children }: { title: string; value: string; tone?: string; caption: string; children?: ReactNode }) {
  return (
    <motion.div variants={item}>
      <Glass radius="xl" className="p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-3">{title}</h2>
          <span className={`font-display text-[28px] font-light tabular-nums ${tone ?? ''}`}>{value}</span>
        </div>
        {children && <div className="mt-3">{children}</div>}
        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{caption}</p>
      </Glass>
    </motion.div>
  );
}

/** Kp: last 24 h observed + 3-day forecast as soft bars; G-storm levels tinted. */
function KpBars({ series, now }: { series: { time: string; kp: number; kind: string }[]; now: Date }) {
  const nowIso = now.toISOString();
  return (
    <div>
      <div className="flex h-20 items-end gap-[2px]" role="img" aria-label="Kp, last day and next three days">
        {series.map((p, i) => {
          const future = p.time > nowIso;
          const col = p.kp >= 5 ? 'var(--c-magenta)' : p.kp >= 4 ? 'var(--c-emerald)' : 'var(--c-teal)';
          return (
            <motion.div
              key={p.time}
              className="flex-1 rounded-t-[3px]"
              style={{ background: col, opacity: future ? 0.4 : 0.85 }}
              initial={{ height: 2 }}
              animate={{ height: `${Math.max(4, (p.kp / 9) * 100)}%` }}
              transition={{ ...spring, delay: i * 0.01 }}
              title={`${hhmm(p.time)} Kp ${p.kp}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>yesterday</span>
        <span>now</span>
        <span>+3 days</span>
      </div>
    </div>
  );
}

export function SpaceScreen({ c }: { c: Conditions }) {
  const t = useT();
  const d = c.sw.data?.data;
  const kp = kpFactor(d?.kp.now?.kp ?? null);
  const bz = bzFactor(d?.solarWind.latest?.bz ?? null);
  const sp = speedFactor(d?.solarWind.latest?.speed);
  const stale = c.sw.data?.meta.sources.some((s) => s.stale);
  return (
    <motion.div
      className="mx-auto max-w-xl space-y-3 px-5 pb-[calc(env(safe-area-inset-bottom)+108px)] pt-[max(20px,env(safe-area-inset-top))]"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: STAGGER } } }}
    >
      <motion.header variants={item} className="mb-4 mt-2">
        <h1 className="on-sky font-display text-[34px] font-light">{t('space.title')}</h1>
        <div className="on-sky flex gap-2 text-ink-2">
          <Freshness at={d?.solarWind.latest?.time} stale={stale} warnMin={10} label="Solar wind" />
        </div>
      </motion.header>

      <NowcastCard />

      <Metric title="Kp index" value={d?.kp.now ? d.kp.now.kp.toFixed(1) : '—'} tone={levelColor[kp.level]} caption={`${kp.sentence}${d?.kp.max24h ? ` Peak in the next day: Kp ${d.kp.max24h.kp.toFixed(1)} around ${hhmm(d.kp.max24h.time)}.` : ''}`}>
        {d && <KpBars series={d.kp.series} now={c.now} />}
      </Metric>

      <Metric title="Bz · last 6 h" value={bz.value} tone={levelColor[bz.level]} caption={`${bz.sentence} Below the dotted line means south.`}>
        <Sparkline values={(d?.solarWind.mag6h ?? []).map((p) => p.bz)} zero={0} color="var(--c-violet)" label="Bz over the last 6 hours" />
      </Metric>

      <Metric title="Solar wind speed" value={sp.value} tone={levelColor[sp.level]} caption={sp.sentence}>
        <Sparkline values={(d?.solarWind.wind6h ?? []).map((p) => p.speed)} color="var(--c-teal)" label="Solar wind speed over the last 6 hours" />
      </Metric>

      <Metric
        title="Density"
        value={d?.solarWind.latest?.density != null ? `${d.solarWind.latest.density.toFixed(1)}/cm³` : '—'}
        caption="How many particles are in the solar wind. Denser gusts push harder on Earth's field."
      >
        <Sparkline values={(d?.solarWind.wind6h ?? []).map((p) => p.density)} color="var(--c-emerald)" label="Solar wind density over the last 6 hours" />
      </Metric>

      <motion.p variants={item} className="on-sky px-1 pt-2 text-[12px] leading-relaxed text-ink-3">
        {d?.solarWind.spacecraft ? `Measured by ${d.solarWind.spacecraft} at L1, ~1.5 million km sunward — about 30–60 min before it reaches Earth. ` : ''}
        Data: NOAA Space Weather Prediction Center. Flares, CMEs and the 27-day outlook arrive in a later build.
      </motion.p>
    </motion.div>
  );
}

const LEVEL_TONE = { quiet: 'text-ink-2', loading: 'text-fair', likely: 'text-good', onset: 'text-magenta' } as const;

/** Substorm nowcast + live ground magnetometer: the best "it's kicking off now" signal. */
function NowcastCard() {
  const q = useNowcast();
  const d = q.data?.data;
  return (
    <motion.div variants={item}>
      <Glass radius="xl" className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-3">Substorm nowcast</h2>
          {d?.kpEstimate && <span className="text-[12px] text-ink-3">1-min Kp est. {d.kpEstimate.kp.toFixed(1)}</span>}
        </div>
        <div className={`mt-1 font-display text-[26px] font-light leading-tight ${d ? LEVEL_TONE[d.level] : ''}`}>{d?.headline ?? '…'}</div>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{d?.detail}</p>
        {d?.ground && d.ground.series.length > 2 && (
          <div className="mt-3">
            <Sparkline values={d.ground.series.map((p) => p.x)} color="var(--c-magenta)" label={`Ground magnetometer ${d.ground.name}, last 3 hours`} />
            <p className="mt-1 text-[12px] text-ink-3">
              Ground magnetometer, {d.ground.name}: a sharp dip means a substorm is under way. Data ~15 min behind.
            </p>
          </div>
        )}
        {!d?.ground && d && <p className="mt-2 text-[12px] text-ink-3">Ground magnetometer temporarily unavailable; using solar-wind data only.</p>}
      </Glass>
    </motion.div>
  );
}
