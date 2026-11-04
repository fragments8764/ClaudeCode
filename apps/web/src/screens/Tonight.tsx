import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronDown, ChevronRight, Clock, Cloud, CloudOff, Gauge, History, Lightbulb, LayoutGrid, MapPin, MessageCircleQuestion, Moon, ShieldCheck, SlidersHorizontal, TriangleAlert, CloudSun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spring, STAGGER } from '../design/tokens';
import { Freshness } from '../components/Freshness';
import { DEMO, DEMO_NAME, type Conditions } from '../lib/conditions';
import { cloudFactor, kpFactor, levelColor } from '../lib/explain';
import { dateLabel, hhmm, until } from '../lib/format';
import { isIceland, nextDarkNight } from '@nordurljos/core';
import { haptic } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { chime } from '../lib/sound';
import { useSettings } from '../lib/store';
import { useSafetySummary } from '../sheets/SafetySheet';
import { pendingFeedback } from '../sheets/FeedbackSheet';
import { ageText, staleSources } from '../lib/staleness';
import { useActivePlan } from '../sheets/PlanSheet';
import { contextualTip, dismissTip } from '../lib/tips';
import { useCloudGaps } from '../lib/gaps';
import { useFeatures } from '../lib/features';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { PullToRefresh } from '../ui/PullToRefresh';
import { ScoreRing } from '../ui/ScoreRing';
import { StatPill } from '../ui/StatPill';

export type SheetId = 'cloud' | 'activity' | 'moon' | 'settings' | 'location' | 'tools' | 'score' | 'bz' | 'speed' | 'density';

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring },
};

export function TonightScreen({ c, open, openTool, onFeedback, online, onPlan }: { c: Conditions; open: (s: SheetId) => void; openTool: (t: 'planner' | 'safety' | 'health' | 'gaps') => void; onFeedback: (night: string) => void; online: boolean; onPlan: () => void }) {
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
  // Short phones (iPhone SE/mini): shrink the hero so the verdict, pills and next card fit above the tab bar.
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  const short = vh < 760;
  const ringSize = vh < 620 ? 156 : vh < 700 ? 196 : short ? 228 : 264;
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
  // Light season: say when dark skies come back instead of a misleading "wait for darkness"
  const darkReturns = useMemo(() => (c.plan.noDarkness ? nextDarkNight(c.now, location.lat, location.lon) : null), [c.plan.noDarkness, c.now, location.lat, location.lon]);
  if (s?.verdict === 'wait-dark')
    sub = c.plan.noDarkness ? (darkReturns ? t('dark.returns', { d: dateLabel(darkReturns, { day: 'numeric', month: 'long' }) }) : t('dark.none')) : c.plan.darkStart ? t('dark.from', { t: hhmm(c.plan.darkStart) }) : sub;
  const verdictText = s ? (s.verdict === 'wait-dark' && c.plan.noDarkness ? t('verdict.bright') : t(`verdict.${s.verdict}`)) : ' ';

  // Never show stale data as live
  const metas = [...(c.sw.data?.meta.sources ?? []), ...(c.clouds.data?.meta.sources ?? []), ...(c.aurora.data?.meta.sources ?? [])];
  const stale = DEMO ? [] : staleSources(metas, c.now);
  const oldest = metas.map((m) => m.fetchedAt).filter((x): x is string => !!x).sort()[0];
  const feedback = pendingFeedback(c.now);
  const plan = useActivePlan();
  const { gaps } = useCloudGaps(c.now);
  const localCloudy = (DEMO?.cloud ?? cd?.effective ?? 0) > 40;
  const feat = useFeatures();
  const gap = feat('route.extras') && isIceland(location.lat, location.lon) && localCloudy && !c.plan.noDarkness ? gaps[0] : undefined;
  const planOverdue = plan && c.now.getTime() > new Date(plan.returnBy).getTime();
  const [tipTick, setTipTick] = useState(0);
  const w = c.clouds.data?.data.weather;
  const tip = tipTick >= 0 ? contextualTip({ dark: c.sun.darknessFactor >= 0.6, score: s?.score ?? 0, feelsLike: w?.feelsLike ?? null, airC: w?.temperature ?? null, gust: Math.max(w?.windGust ?? 0, safety.gust), planActive: !!plan }) : null;

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

        {/* data freshness: offline badge, or a subtle stale banner — tap for Data health */}
        {!online && oldest ? (
          <motion.button variants={item} onClick={() => openTool('health')} className="glass pill mx-auto mt-3 flex min-h-[40px] items-center gap-2 px-4 text-[13px] text-fair">
            <CloudOff size={14} strokeWidth={1.75} aria-hidden /> {t('offline.badge', { t: hhmm(oldest) })}
          </motion.button>
        ) : (
          stale[0] && (
            <motion.button variants={item} onClick={() => openTool('health')} className="glass pill mx-auto mt-3 flex min-h-[40px] items-center gap-2 px-4 text-[13px] text-fair">
              <History size={14} strokeWidth={1.75} aria-hidden /> {t('stale.banner', { label: stale[0].label, age: ageText(stale[0].ageMin) })}
            </motion.button>
          )
        )}

        {safety.alert && (
          <motion.button variants={item} onClick={() => openTool('safety')} className="glass pill mx-auto mt-3 flex min-h-[40px] items-center gap-2 px-4 text-[13px] text-fair">
            <TriangleAlert size={14} strokeWidth={1.75} aria-hidden />
            {safety.warnings.length ? t('warn.chip', { n: safety.warnings.length }) : safety.gust >= 20 ? `Gusts ${Math.round(safety.gust)} m/s nearby` : 'Road closures nearby'}
          </motion.button>
        )}

        {plan && (
          <motion.button variants={item} onClick={onPlan} className={`glass pill mx-auto mt-3 flex min-h-[44px] items-center gap-2 px-4 text-[13px] ${planOverdue ? 'text-poor' : ''}`}>
            <ShieldCheck size={15} strokeWidth={1.75} aria-hidden /> {planOverdue ? t('plan.overdue') : t('plan.active', { t: hhmm(plan.returnBy) })}
          </motion.button>
        )}

        {feedback && (
          <motion.button variants={item} onClick={() => onFeedback(feedback.night)} className="glass pill mx-auto mt-3 flex min-h-[44px] items-center gap-2 px-4 text-[13px]">
            <MessageCircleQuestion size={15} strokeWidth={1.75} aria-hidden /> {t('feedback.card')} <span className="text-[rgb(var(--aurora-rgb))]">{t('feedback.cta')}</span>
          </motion.button>
        )}

        {/* Hero */}
        <div className={`flex flex-1 flex-col items-center justify-center ${short ? 'py-3' : 'py-6'}`}>
          <motion.button
            variants={item}
            whileTap={{ scale: 0.97 }}
            onClick={() => open('score')}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]"
            aria-label={s ? `Aurora score ${s.score} of 100. Why this score?` : 'Aurora score loading'}
          >
            <ScoreRing score={s?.score ?? null} size={ringSize} night={night} celebrate={celebrate} />
          </motion.button>
          <motion.h1 variants={item} className={`on-sky text-center font-display font-light leading-tight ${short ? 'mt-4 text-[27px]' : 'mt-6 text-[30px]'}`} aria-live="polite">
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

        {tip && (
          <motion.div variants={item} className="mb-3">
            <div className="glass flex items-start gap-3 px-4 py-3" style={{ borderRadius: 'var(--r-lg)' }} role="note">
              <Lightbulb size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fair" aria-hidden />
              <div className="min-w-0 flex-1 leading-snug">
                <div className="text-[14px] font-medium">{tip.title}</div>
                <div className="text-[13px] text-ink-2">{tip.body}</div>
              </div>
              <button
                onClick={() => {
                  dismissTip(tip.id);
                  setTipTick((n) => n + 1);
                }}
                className="min-h-[44px] shrink-0 px-2 text-[13px] text-ink-2"
              >
                {t('tip.gotit')}
              </button>
            </div>
          </motion.div>
        )}

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

        {/* Cloud-gap hunter: cloudy here, but clear sky within reach */}
        {gap && (
          <motion.div variants={item} className="mt-3">
            <Glass radius="xl" className="overflow-hidden">
              <button onClick={() => (haptic('tap'), openTool('gaps'))} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <CloudSun size={18} strokeWidth={1.5} className="shrink-0 text-good" aria-hidden />
                <span className="min-w-0 flex-1 text-[14px] leading-snug">{gap.summary}</span>
                <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" aria-hidden />
              </button>
            </Glass>
          </motion.div>
        )}

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
