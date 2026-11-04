import { consumeUpdateNotice, setUpdateGuard } from './lib/update';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { CloudOff, Sparkles } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calm, scoreColor, spring } from './design/tokens';
import { useTilt } from './hooks/useTilt';
import { useConditions } from './lib/conditions';
import { haptic } from './lib/haptics';
import { useT } from './lib/i18n';
import { startOutbox } from './lib/outbox';
import { recordNight } from './sheets/FeedbackSheet';
import { useCloudGaps } from './lib/gaps';
import { startTelemetry, track } from './lib/telemetry';
import { useFeatures } from './lib/features';
import { speak } from './lib/voice';
import { useNowcast } from './lib/api';
import { PlanViewer } from './screens/PlanViewer';
import { startLiveLocation } from './lib/plan';
import type { RankedSpot } from '@nordurljos/core';
import { stats, useJournal } from './lib/journal';
import { shareFile } from './lib/share';
import { setPadIntensity, startPad, stopPad } from './lib/sound';
import { applyPrefs, useReducedMotionPref, useSettings, type Tab } from './lib/store';
import { ActivitySheet, CloudSheet, MoonSheet } from './sheets/DetailSheets';
import { ClearNowSheet } from './sheets/ClearNowSheet';
import { LocationSheet } from './sheets/LocationSheet';
import { SafetySheet } from './sheets/SafetySheet';
import { ToolsSheet, type ToolId } from './sheets/ToolsSheet';
import { CamerasScreen } from './screens/Cameras';
import { SpaceScreen } from './screens/Space';
import { TonightScreen, type SheetId } from './screens/Tonight';
import { WidgetScreen } from './screens/Widget';
import { AuroraSky } from './sky/AuroraSky';
import { Glass, RefractionDefs } from './ui/Glass';
import { Onboarding } from './ui/Onboarding';
import { TabBar } from './ui/TabBar';

const MapScreen = lazy(() => import('./screens/MapScreen'));
// Rarely-used tools are split out of the first load and prefetched when the browser is idle.
const loaders = {
  photo: () => import('./sheets/PhotoSheet'),
  ar: () => import('./screens/ArCompass'),
  journal: () => import('./sheets/JournalSheet'),
  learn: () => import('./sheets/LearnSheet'),
  sighting: () => import('./sheets/SightingSheet'),
  planner: () => import('./sheets/PlannerSheet'),
  ambient: () => import('./screens/Ambient'),
  settings: () => import('./sheets/SettingsSheet'),
  health: () => import('./sheets/HealthSheet'),
  prepare: () => import('./sheets/PrepareSheet'),
  plan: () => import('./sheets/PlanSheet'),
  gaps: () => import('./sheets/GapSheet'),
  outlook: () => import('./sheets/OutlookSheet'),
  checklist: () => import('./sheets/ChecklistSheet'),
  driving: () => import('./screens/Driving'),
  feed: () => import('./sheets/CommunitySheets'),
  privacy: () => import('./sheets/PrivacySheet'),
  sources: () => import('./sheets/SourcesSheet'),
  feedback: () => import('./sheets/FeedbackSheet'),
};
const HealthSheet = lazy(() => loaders.health().then((m) => ({ default: m.HealthSheet })));
const PrepareSheet = lazy(() => loaders.prepare().then((m) => ({ default: m.PrepareSheet })));
const PlanSheet = lazy(() => loaders.plan().then((m) => ({ default: m.PlanSheet })));
const GapSheet = lazy(() => loaders.gaps().then((m) => ({ default: m.GapSheet })));
const OutlookSheet = lazy(() => loaders.outlook().then((m) => ({ default: m.OutlookSheet })));
const ChecklistSheet = lazy(() => loaders.checklist().then((m) => ({ default: m.ChecklistSheet })));
const DrivingMode = lazy(() => loaders.driving().then((m) => ({ default: m.DrivingMode })));
const FeedSheet = lazy(() => loaders.feed().then((m) => ({ default: m.FeedSheet })));
const PrivacySheet = lazy(() => loaders.privacy().then((m) => ({ default: m.PrivacySheet })));
const SourcesSheet = lazy(() => loaders.sources().then((m) => ({ default: m.SourcesSheet })));
const FeedbackSheet = lazy(() => loaders.feedback().then((m) => ({ default: m.FeedbackSheet })));
const PhotoSheet = lazy(() => loaders.photo().then((m) => ({ default: m.PhotoSheet })));
const ArCompass = lazy(() => loaders.ar().then((m) => ({ default: m.ArCompass })));
const JournalSheet = lazy(() => loaders.journal().then((m) => ({ default: m.JournalSheet })));
const LearnSheet = lazy(() => loaders.learn().then((m) => ({ default: m.LearnSheet })));
const SightingSheet = lazy(() => loaders.sighting().then((m) => ({ default: m.SightingSheet })));
const PlannerSheet = lazy(() => loaders.planner().then((m) => ({ default: m.PlannerSheet })));
const Ambient = lazy(() => loaders.ambient().then((m) => ({ default: m.Ambient })));
const SettingsSheet = lazy(() => loaders.settings().then((m) => ({ default: m.SettingsSheet })));

const ORDER: Tab[] = ['tonight', 'map', 'cameras', 'space'];
const isTab = (s: string): s is Tab => (ORDER as string[]).includes(s);

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function useHashRoute() {
  const [h, setH] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setH(location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

export default function App() {
  const { nightVision: nvPref, reduceTransparency, lowPower: lpPref, tab, setTab, reduceMotion, onboarded, sound, location: loc, batterySaver, autoDriving, set: setPref } = useSettings();
  // Battery saver implies red-only + low power + a still sky
  const nightVision = nvPref || batterySaver;
  const lowPower = lpPref || batterySaver;
  const reduced = useReducedMotionPref();
  const online = useOnline();
  const t = useT();
  const c = useConditions();
  const route = useHashRoute();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [tool, setTool] = useState<ToolId | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const closeTool = useCallback(() => setTool(null), []);
  const [dir, setDir] = useState(1);
  const [camId, setCamId] = useState<string | null>(null);
  const [clearNow, setClearNow] = useState(false);
  const [mapIntent, setMapIntent] = useState<'best' | null>(null);
  const [onbStep, setOnbStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // offline outbox (queued sightings / feedback) replays when signal returns
  useEffect(() => startOutbox(), []);
  // opt-in analytics & crash reports (no-ops unless enabled in Privacy)
  useEffect(() => startTelemetry(), []);
  useEffect(() => track(`tab.${tab}`), [tab]);
  const has = useFeatures();
  // opt-in live location for an active shared plan
  useEffect(() => startLiveLocation(), []);
  const { gaps } = useCloudGaps(c.now);

  // ── Driving mode: manual, or automatic from GPS speed (only if location permission is already granted) ──
  useEffect(() => {
    if (!autoDriving || !('geolocation' in navigator)) return;
    let watch: number | null = null;
    let fast = 0;
    let stillSince: number | null = null;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (cancelled || p.state !== 'granted') return;
        watch = navigator.geolocation.watchPosition(
          (pos) => {
            const v = pos.coords.speed ?? 0;
            if (v >= 7) {
              fast++;
              stillSince = null;
              if (fast >= 2) setDriving((d) => d ?? 'auto');
            } else {
              fast = 0;
              if (v < 1) {
                stillSince ??= Date.now();
                if (Date.now() - stillSince > 3 * 60_000) setDriving((d) => (d === 'auto' ? null : d));
              }
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10_000 },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watch != null) navigator.geolocation.clearWatch(watch);
    };
  }, [autoDriving]);

  // ── Spoken alerts: big changes only, while the app is open ──
  const nowcast = useNowcast();
  const spokenPrev = useRef<{ verdict?: string; level?: string; score?: number }>({});
  useEffect(() => {
    const s = c.score;
    const lvl = nowcast.data?.data.level;
    const kp = c.sw.data?.data.kp.now?.kp;
    const p = spokenPrev.current;
    if (lvl === 'onset' && p.level !== 'onset') speak(`Aurora burst starting now${kp != null ? `, Kp ${Math.round(kp)}` : ''}. Look up.`);
    else if (s?.verdict === 'go' && p.verdict && p.verdict !== 'go') speak(`Go outside now. Aurora score ${s.score}.`);
    else if (s && p.score != null && s.score - p.score >= 15) speak(`Aurora chances jumped to ${s.score}.`);
    spokenPrev.current = { verdict: s?.verdict, level: lvl, score: s?.score };
  }, [c.score, nowcast.data, c.sw.data]);
  const openPlan = (r?: RankedSpot | null) => {
    const end = c.best?.end ?? c.plan.darkEnd;
    const ret = r && end ? new Date(new Date(end).getTime() + r.driveMin * 60_000).toISOString() : end;
    setPlanFor({ dest: r ? { name: r.spot.name, lat: r.spot.lat, lon: r.spot.lon } : null, ret });
  };

  // "Did you see it?" — deep link from the morning push: #/feedback?night=YYYY-MM-DD
  useEffect(() => {
    const m = route.match(/^feedback\?night=(\d{4}-\d{2}-\d{2})/);
    if (m) {
      setFeedbackNight(m[1]!);
      history.replaceState(null, '', '#/tonight');
    }
  }, [route]);

  // remember tonight's peak score locally (for the morning question)
  useEffect(() => {
    if (c.score && c.sun.darknessFactor >= 0.6) recordNight(c.score.score, loc);
  }, [c.score, c.sun.darknessFactor, loc]);

  // Lazy sheets mount on first open and stay mounted so their exit animations still play.
  const [mounted, setMounted] = useState<Set<string>>(() => new Set());
  const [planFor, setPlanFor] = useState<{ dest: { name: string; lat: number; lon: number } | null; ret: string | null } | null>(null);
  const [extra, setExtra] = useState<'privacy' | 'sources' | null>(null);
  const [driving, setDriving] = useState<null | 'manual' | 'auto'>(null);
  const [feedbackNight, setFeedbackNight] = useState<string | null>(null);
  useEffect(() => {
    const want = [tool, sheet === 'settings' ? 'settings' : null, planFor ? 'plan' : null, extra, driving ? 'driving' : null, feedbackNight ? 'feedback' : null].filter((x): x is string => !!x);
    const missing = want.filter((k) => !mounted.has(k));
    if (missing.length) setMounted((m) => new Set([...m, ...missing]));
  }, [tool, sheet, planFor, extra, driving, feedbackNight, mounted]);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2500));
    const id = setTimeout(() => idle(() => Object.values(loaders).forEach((l) => l().catch(() => {}))), 4000);
    return () => clearTimeout(id);
  }, []);
  const hasMounted = (k: string) => mounted.has(k);

  useEffect(() => applyPrefs({ nightVision, reduceTransparency, lowPower }), [nightVision, reduceTransparency, lowPower]);
  useTilt(!reduced && !lowPower);

  // Glass tint follows the aurora colour (score ramp). Night Vision keeps its own red tokens.
  useEffect(() => {
    const root = document.documentElement;
    if (nightVision) root.style.removeProperty('--aurora-rgb');
    else root.style.setProperty('--aurora-rgb', scoreColor(c.score?.score ?? 15).join(' '));
  }, [c.score?.score, nightVision]);

  // Hash ⇄ tab (deep links, manifest shortcuts, back button)
  useEffect(() => {
    if (isTab(route)) setTab(route);
  }, [route, setTab]);

  // Auto-update: only reload when nothing is open and you're not typing or driving.
  const busyRef = useRef(false);
  busyRef.current = !!(tool || sheet || planFor || extra || driving || feedbackNight);
  useEffect(() => {
    setUpdateGuard(() => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
      return !busyRef.current && !typing;
    });
    const v = consumeUpdateNotice();
    if (v) {
      setToast(t('update.done', { v }));
      setTimeout(() => setToast(null), 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart haptic nudge: the score jumps ≥15 while the app is open
  const lastScore = useRef<number | null>(null);
  useEffect(() => {
    const s = c.score?.score;
    if (s == null) return;
    if (lastScore.current != null && s - lastScore.current >= 15 && s >= 25) {
      haptic('nudge');
      setToast(t('nudge', { n: s }));
      setTimeout(() => setToast(null), 6000);
    }
    lastScore.current = s;
  }, [c.score?.score, t]);

  // Ambient sound pad follows sky intensity (started from the Settings toggle gesture)
  useEffect(() => {
    if (sound) startPad(c.sky.intensity);
    else stopPad();
  }, [sound]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sound) setPadIntensity(c.sky.intensity);
  }, [c.sky.intensity, sound]);

  const go = (to: Tab) => {
    setDir(ORDER.indexOf(to) >= ORDER.indexOf(tab) ? 1 : -1);
    setTab(to);
    history.replaceState(null, '', `#/${to}`);
  };

  const shareTonight = async (postcard = false) => {
    const st = stats(useJournal.getState().entries);
    const { renderTonightCard } = await import('./lib/shareCard');
    const file = await renderTonightCard({
      score: c.score?.score ?? 0,
      headline: c.score ? t(`verdict.${c.score.verdict}`) : '',
      place: loc.label,
      window: c.best,
      kp: c.sw.data?.data.kp.now?.kp ?? null,
      cloud: c.clouds.data?.data.effective ?? null,
      night: nightVision,
      postcard: postcard ? { nights: st.nightsOut, seen: st.nightsSeen } : undefined,
    });
    const r = await shareFile(file, 'Tonight in Iceland', `Aurora score ${c.score?.score ?? '—'} near ${loc.label}`);
    setToast(r === 'downloaded' ? 'Card saved to your downloads' : 'Shared');
    setTimeout(() => setToast(null), 4000);
  };

  const pickTool = (id: ToolId) => {
    haptic('tap');
    track(`tool.${id}`);
    if (id === 'saver') {
      setTool(null);
      setPref('batterySaver', !batterySaver);
      setToast(batterySaver ? 'Battery saver off' : t('saver.on'));
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (id === 'driving') {
      setTool(null);
      setDriving('manual');
      return;
    }
    if (id === 'share') {
      setTool(null);
      shareTonight().catch(() => {});
      return;
    }
    setTool(id);
  };

  // Onboarding brightens the sky as you progress
  const showOnb = !onboarded && route !== 'widget' && !route.startsWith('plan/');
  const sky = useMemo(() => (showOnb ? { ...c.sky, intensity: 0.25 + onbStep * 0.3, speed: 0.6 + onbStep * 0.25 } : c.sky), [showOnb, onbStep, c.sky]);

  const planRoute = route.match(/^plan\/([0-9a-f]{6,40})(\?checkin=1)?/);
  if (planRoute) {
    return (
      <MotionConfig reducedMotion="user">
        <RefractionDefs />
        <AuroraSky params={c.sky} night={nightVision} reducedMotion={reduced} lowPower={lowPower} />
        <main className="relative" style={{ zIndex: 'var(--z-content)' }}>
          <PlanViewer id={planRoute[1]!} wantCheckin={!!planRoute[2]} />
        </main>
      </MotionConfig>
    );
  }

  if (route === 'widget') {
    return (
      <MotionConfig reducedMotion="user">
        <AuroraSky params={c.sky} night={nightVision} reducedMotion={reduced} lowPower={lowPower} />
        <main className="relative" style={{ zIndex: 'var(--z-content)' }}>
          <WidgetScreen c={c} />
        </main>
      </MotionConfig>
    );
  }

  const screen = (() => {
    switch (tab) {
      case 'tonight':
        return <TonightScreen c={c} online={online} open={(s) => (s === 'tools' ? setTool(null) : null, setSheet(s))} openTool={(id) => setTool(id)} onFeedback={setFeedbackNight} onPlan={() => openPlan(null)} />;
      case 'space':
        return <SpaceScreen c={c} />;
      case 'map':
        return (
          <Suspense fallback={<div className="grid min-h-dvh place-items-center"><div className="skeleton h-10 w-48 rounded-full" /></div>}>
            <MapScreen
              c={c}
              intent={mapIntent}
              clearIntent={() => setMapIntent(null)}
              onPlan={(r) => openPlan(r)}
              openCamera={(id) => {
                go('cameras');
                setCamId(id);
              }}
            />
          </Suspense>
        );
      case 'cameras':
        return <CamerasScreen openId={camId} setOpenId={setCamId} onClearNow={() => setClearNow(true)} />;
    }
  })();

  return (
    <MotionConfig reducedMotion={reduceMotion === 'on' ? 'always' : reduceMotion === 'off' ? 'never' : 'user'} transition={reduced ? calm : spring}>
      <RefractionDefs />
      <AuroraSky params={sky} night={nightVision} reducedMotion={reduced || batterySaver} lowPower={lowPower} />
      {batterySaver && <div aria-hidden className="pointer-events-none fixed inset-0 bg-black/35" style={{ zIndex: 'var(--z-toast)' }} />}

      <AnimatePresence>
        {((!online && tab !== 'tonight') || toast) && (
          <motion.div className="pointer-events-none fixed inset-x-0 top-0 flex justify-center px-4 pt-[calc(max(14px,env(safe-area-inset-top))+58px)]" style={{ zIndex: 'var(--z-toast)' }} initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}>
            <Glass radius="pill" role="status" className="flex items-center gap-2 px-4 py-2 text-[13px]">
              {!online && !toast ? <CloudOff size={15} strokeWidth={1.5} aria-hidden /> : <Sparkles size={15} strokeWidth={1.5} aria-hidden />}
              {!online && !toast ? t('offline.banner') : toast}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {!showOnb && tool !== 'ambient' && (
        <LayoutGroup>
          <main className="relative mx-auto max-w-xl" style={{ zIndex: 'var(--z-content)' }}>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={tab}
                custom={dir}
                // The map is full-bleed `position: fixed`; a transformed ancestor would collapse it,
                // so the Map tab cross-fades while the others slide.
                variants={
                  tab === 'map'
                    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
                    : {
                        enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * 28 }),
                        center: { opacity: 1, x: 0, transitionEnd: { transform: 'none' } },
                        exit: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * -28 }),
                      }
                }
                initial="enter"
                animate="center"
                exit="exit"
              >
                {screen}
              </motion.div>
            </AnimatePresence>
          </main>

          <TabBar tab={tab} onChange={go} />

          <CloudSheet c={c} open={sheet === 'cloud'} onClose={close} />
          <ActivitySheet c={c} open={sheet === 'activity'} onClose={close} />
          <MoonSheet c={c} open={sheet === 'moon'} onClose={close} />
        </LayoutGroup>
      )}

      {showOnb && <Onboarding step={onbStep} setStep={setOnbStep} onDone={() => setOnbStep(0)} />}

      <Suspense fallback={null}>
        {hasMounted('settings') && (
          <SettingsSheet
            open={sheet === 'settings'}
            onClose={close}
            onOpen={(w) => {
              setSheet(null);
              if (w === 'health') setTool('health');
              else setExtra(w);
            }}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>{hasMounted('privacy') && <PrivacySheet open={extra === 'privacy'} onClose={() => setExtra(null)} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('sources') && <SourcesSheet open={extra === 'sources'} onClose={() => setExtra(null)} />}</Suspense>
      <LocationSheet open={sheet === 'location'} onClose={close} />
      <ToolsSheet
        open={sheet === 'tools'}
        onClose={close}
        onPick={(id) => (setSheet(null), pickTool(id))}
        isEnabled={(id) => (id === 'gaps' ? has('route.extras') : id === 'feed' || id === 'sighting' ? has('community') : id === 'outlook' ? has('outlook.5night') : id === 'prepare' ? has('multi-region') : true)}
      />
      <ClearNowSheet
        open={clearNow}
        onClose={() => setClearNow(false)}
        onOpenCamera={(id) => {
          setClearNow(false);
          go('cameras');
          setCamId(id);
        }}
      />
      <SafetySheet c={c} open={tool === 'safety'} onClose={closeTool} onPlan={() => (setTool(null), openPlan(null))} />
      <Suspense fallback={null}>{hasMounted('plan') && <PlanSheet open={!!planFor} onClose={() => setPlanFor(null)} destination={planFor?.dest ?? null} suggestedReturn={planFor?.ret ?? null} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('health') && <HealthSheet c={c} open={tool === 'health'} onClose={closeTool} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('prepare') && <PrepareSheet open={tool === 'prepare'} onClose={closeTool} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('gaps') && <GapSheet gaps={gaps} open={tool === 'gaps'} onClose={closeTool} darkFrom={c.plan.darkStart} darkUntil={c.plan.darkEnd} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('outlook') && <OutlookSheet open={tool === 'outlook'} onClose={closeTool} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('checklist') && <ChecklistSheet c={c} open={tool === 'checklist'} onClose={closeTool} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('feed') && <FeedSheet open={tool === 'feed'} onClose={closeTool} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('driving') && <DrivingMode c={c} open={!!driving} auto={driving === 'auto'} gap={gaps[0]} onClose={() => setDriving(null)} />}</Suspense>
      <Suspense fallback={null}>{hasMounted('feedback') && <FeedbackSheet night={feedbackNight} open={!!feedbackNight} onClose={() => setFeedbackNight(null)} />}</Suspense>
      <Suspense fallback={null}>
        {hasMounted('sighting') && <SightingSheet c={c} open={tool === 'sighting'} onClose={closeTool} />}
        {hasMounted('planner') && (
          <PlannerSheet
            c={c}
            open={tool === 'planner'}
            onClose={closeTool}
            onFindSpot={() => {
              setTool(null);
              setMapIntent('best');
              go('map');
            }}
          />
        )}
        {hasMounted('photo') && <PhotoSheet c={c} open={tool === 'photo'} onClose={closeTool} />}
        {hasMounted('journal') && <JournalSheet c={c} open={tool === 'journal'} onClose={closeTool} onPostcard={() => shareTonight(true).catch(() => {})} />}
        {hasMounted('learn') && <LearnSheet open={tool === 'learn'} onClose={closeTool} />}
        {hasMounted('ar') && <ArCompass c={c} open={tool === 'ar'} onClose={closeTool} />}
        {hasMounted('ambient') && <Ambient c={c} open={tool === 'ambient'} onClose={closeTool} />}
      </Suspense>
    </MotionConfig>
  );
}
