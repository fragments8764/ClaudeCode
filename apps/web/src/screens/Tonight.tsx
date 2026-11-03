import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronDown, ChevronRight, Clock, Cloud, Gauge, LayoutGrid, MapPin, Moon, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { spring, STAGGER } from '../design/tokens';
import { Freshness } from '../components/Freshness';
import { DEMO, DEMO_NAME, type Conditions } from '../lib/conditions';
import { cloudFactor, kpFactor, levelColor } from '../lib/explain';
import { hhmm, until } from '../lib/format';
import { haptic } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { chime } from '../lib/sound';
import { useSettings } from '../lib/store';
import { useSafetySummary } from '../sheets/SafetySheet';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { PullToRefresh } from '../ui/PullToRefresh';
import { ScoreRing } from '../ui/ScoreRing';
import { StatPill } from '../ui/StatPill';

export type SheetId = 'cloud' | 'activity' | 'moon' | 'settings' | 'location' | 'tools';

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring },
};

export function TonightScreen({ c, open, openTool }: { c: Conditions; open: (s: SheetId) => void; openTool: (t: 'planner' | 'safety') => void }) {
  const t = useT();
  const qc = useQueryClient();
  const location = useSettings((s) => s.location);
  const night = useSettings((s) => s.nightVision);
  const chimeOn = useSettings((s) => s.chime);
  const safety = useSafetySummary();
  const cd = c.clouds.data?.data;
  const swd = c.sw.data?.data;
  const cloud = cloudFactor(DEMO?.cloud ?? cd?.effective ?? null);
  const kpNow = DEMO?.kp ?? swd?.kp.now?.kp ?? null;
  const kp = kpFactor(kpNow);
  const moonUp = c.plan.moon.altitudeDeg > 0;
  const s = c.score;

  // "Go now" celebration when the verdict crosses into go
  const [celebrate, setCelebrate] = useState(0);
  const prev = useRef(s?.verdict);
  useEffect(() => {
    if (s?.verdict === 'go' && prev.current && prev.current !== 'go') {
      setCelebrate((n) => n + 1);
      haptic('success');
      if (chimeOn) chime();
    }
    prev.current = s?.verdict;
  }, [s?.verdict, chimeOn]);

  let sub = s ? t(s.limitingLabel ? `limit.${s.limitingLabel}` : 'limit.none') : t('reading');
  if (s?.verdict === 'wait-dark') sub = c.plan.noDarkness ? t('dark.none') : c.plan.darkStart ? t('dark.from', { t: hhmm(c.plan.darkStart) }) : sub;

  const best = c.best;
  const nowMs = c.now.getTime();
  const inBest = best && nowMs >= new Date(best.start).getTime() && nowMs < new Date(best.end).getTime();

  return (
    <PullToRefresh onRefresh={() => qc.refetchQueries({ type: 'active' })}>
      <motion.div className="flex min-h-dvh flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+108px)] pt-[max(14px,env(safe-area-inset-top))]" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: STAGGER } } }}>
        {/* Top: location · tools · settings */}
        <motion.div variants={item} className="flex items-center gap-2">
          <Press onClick={() => open('location')} className="mr-auto max-w-[62%] px-4" aria-label={`Location: ${location.label}. Change`}>
            <MapPin size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
            <span className="truncate text-[15px] font-medium">{location.label}</span>
            <ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" aria-hidden />
          </Press>
          <Press onClick={() => open('tools')} aria-label={t('tools.open')} className="w-12">
            <LayoutGrid size={18} strokeWidth={1.5} aria-hidden />
          </Press>
          <Press onClick={() => open('settings')} aria-label="Settings" className="w-12">
            <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden />
          </Press>
        </motion.div>

        {safety.alert && (
          <motion.button variants={item} onClick={() => openTool('safety')} className="glass pill mx-auto mt-3 flex min-h-[40px] items-center gap-2 px-4 text-[13px] text-fair">
            <TriangleAlert size={14} strokeWidth={1.75} aria-hidden />
            {safety.warnings.length ? t('warn.chip', { n: safety.warnings.length }) : safety.gust >= 20 ? `Gusts ${Math.round(safety.gust)} m/s nearby` : 'Road closures nearby'}
          </motion.button>
        )}

        {/* Hero */}
        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <motion.div variants={item}>
            <ScoreRing score={s?.score ?? null} night={night} celebrate={celebrate} />
          </motion.div>
          <motion.h1 variants={item} className="on-sky mt-6 text-center font-display text-[30px] font-light leading-tight" aria-live="polite">
            {s ? t(`verdict.${s.verdict}`) : ' '}
          </motion.h1>
          <motion.p variants={item} className="on-sky mt-1 text-center text-[15px] text-ink-2">
            {sub}
          </motion.p>
          <motion.div variants={item} className="mt-2">
            {DEMO_NAME ? (
              <span className="glass pill px-3 py-1 text-[12px] text-fair">Demo preview: {DEMO_NAME}. Not live data.</span>
            ) : (
              <Freshness at={c.updatedAt} stale={c.anyStale} warnMin={20} />
            )}
          </motion.div>
        </div>

        {/* Stat pills */}
        <motion.div variants={item} className="flex gap-2">
          <StatPill id="cloud" icon={Cloud} label={t('stat.cloud')} value={cloud.value} tone={levelColor[cloud.level]} onOpen={() => open('cloud')} />
          <StatPill id="activity" icon={Gauge} label={t('stat.kp')} value={kpNow != null ? kpNow.toFixed(1) : '—'} tone={levelColor[kp.level]} onOpen={() => open('activity')} />
          <StatPill
            id="moon"
            icon={Moon}
            label={t('stat.moon')}
            value={moonUp ? `${Math.round(c.plan.moon.illumination * 100)}%` : t('moon.set')}
            tone={moonUp && c.plan.moon.illumination > 0.6 ? 'text-fair' : undefined}
            onOpen={() => open('moon')}
          />
        </motion.div>

        {/* Best window → night planner (Go-now countdown) */}
        {best && (
          <motion.div variants={item} className="mt-3">
            <Glass radius="xl" className="overflow-hidden">
              <button onClick={() => (haptic('tap'), openTool('planner'))} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <Clock size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3">{inBest ? t('best.now') : t('best.tonight')}</div>
                  <div className="text-[15px] font-medium tabular-nums">
                    {hhmm(best.start)}–{hhmm(best.end)}
                    <span className="font-light text-ink-2"> · {inBest ? t('best.left', { t: until(nowMs, best.end) }) : t('best.in', { t: until(nowMs, best.start) })}</span>
                  </div>
                </div>
                <div className="font-display text-xl font-light tabular-nums text-ink-2" aria-label={`Window score ${best.score}`}>
                  {best.score}
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-ink-3" aria-hidden />
              </button>
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </PullToRefresh>
  );
}
