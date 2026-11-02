import { motion } from 'motion/react';
import { ChevronDown, Clock, Cloud, Gauge, MapPin, Moon, SlidersHorizontal } from 'lucide-react';
import { spring, STAGGER } from '../design/tokens';
import { Freshness } from '../components/Freshness';
import { DEMO, DEMO_NAME, type Conditions } from '../lib/conditions';
import { cloudFactor, kpFactor, levelColor } from '../lib/explain';
import { hhmm, until } from '../lib/format';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { ScoreRing } from '../ui/ScoreRing';
import { StatPill } from '../ui/StatPill';

export type SheetId = 'cloud' | 'activity' | 'moon' | 'settings' | 'location';

const LIMIT_COPY: Record<string, string> = {
  Clouds: 'Limited by clouds',
  'Quiet sun': 'Limited by a quiet sun',
  Moonlight: 'Limited by moonlight',
  Daylight: 'Limited by daylight',
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring },
};

export function TonightScreen({ c, open }: { c: Conditions; open: (s: SheetId) => void }) {
  const location = useSettings((s) => s.location);
  const night = useSettings((s) => s.nightVision);
  const cd = c.clouds.data?.data;
  const swd = c.sw.data?.data;
  const cloud = cloudFactor(DEMO?.cloud ?? cd?.effective ?? null);
  const kpNow = DEMO?.kp ?? swd?.kp.now?.kp ?? null;
  const kp = kpFactor(kpNow);
  const moonUp = c.plan.moon.altitudeDeg > 0;
  const s = c.score;

  let sub = s?.limitingLabel ? LIMIT_COPY[s.limitingLabel] : s ? 'Nothing holding it back' : 'Reading the sky…';
  if (s?.verdict === 'wait-dark' && c.plan.darkStart) sub = c.plan.noDarkness ? 'No darkness tonight' : `Dark from ${hhmm(c.plan.darkStart)}`;

  const best = c.best;
  const nowMs = c.now.getTime();
  const inBest = best && nowMs >= new Date(best.start).getTime() && nowMs < new Date(best.end).getTime();

  return (
    <motion.div className="flex min-h-dvh flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+108px)] pt-[max(14px,env(safe-area-inset-top))]" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: STAGGER } } }}>
      {/* Top: location + settings */}
      <motion.div variants={item} className="flex items-center justify-between gap-3">
        <Press onClick={() => open('location')} className="max-w-[70%] px-4" aria-label={`Location: ${location.label}. Change`}>
          <MapPin size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
          <span className="truncate text-[15px] font-medium">{location.label}</span>
          <ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" aria-hidden />
        </Press>
        <Press onClick={() => open('settings')} aria-label="Settings" className="w-12">
          <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden />
        </Press>
      </motion.div>

      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <motion.div variants={item}>
          <ScoreRing score={s?.score ?? null} night={night} />
        </motion.div>
        <motion.h1 variants={item} className="on-sky mt-6 text-center font-display text-[30px] font-light leading-tight" aria-live="polite">
          {s?.headline ?? ' '}
        </motion.h1>
        <motion.p variants={item} className="on-sky mt-1 text-center text-[15px] text-ink-2">
          {sub}
        </motion.p>
        <motion.div variants={item} className="mt-2">
          {DEMO_NAME ? (
            <span className="glass pill px-3 py-1 text-[12px] text-fair">Demo preview: {DEMO_NAME} — not live data</span>
          ) : (
            <Freshness at={c.updatedAt} stale={c.anyStale} warnMin={20} />
          )}
        </motion.div>
      </div>

      {/* Stat pills */}
      <motion.div variants={item} className="flex gap-2">
        <StatPill id="cloud" icon={Cloud} label="Cloud" value={cloud.value} tone={levelColor[cloud.level]} onOpen={() => open('cloud')} />
        <StatPill id="activity" icon={Gauge} label="Kp" value={kpNow != null ? kpNow.toFixed(1) : '—'} tone={levelColor[kp.level]} onOpen={() => open('activity')} />
        <StatPill
          id="moon"
          icon={Moon}
          label="Moon"
          value={moonUp ? `${Math.round(c.plan.moon.illumination * 100)}%` : 'Set'}
          tone={moonUp && c.plan.moon.illumination > 0.6 ? 'text-fair' : undefined}
          onOpen={() => open('moon')}
        />
      </motion.div>

      {/* Best window (Go-now countdown) */}
      {best && (
        <motion.div variants={item} className="mt-3">
          <Glass radius="xl" className="flex items-center gap-3 px-4 py-3">
            <Clock size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{inBest ? 'Best window — now' : 'Best window tonight'}</div>
              <div className="text-[15px] font-medium tabular-nums">
                {hhmm(best.start)}–{hhmm(best.end)}
                <span className="font-light text-ink-2"> · {inBest ? `${until(nowMs, best.end)} left` : `in ${until(nowMs, best.start)}`}</span>
              </div>
            </div>
            <div className="text-right font-display text-xl font-light tabular-nums text-ink-2" aria-label={`Window score ${best.score}`}>
              {best.score}
            </div>
          </Glass>
        </motion.div>
      )}
    </motion.div>
  );
}
