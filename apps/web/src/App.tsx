import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { CloudOff } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { calm, scoreColor, spring } from './design/tokens';
import { useTilt } from './hooks/useTilt';
import { useConditions } from './lib/conditions';
import { applyPrefs, useReducedMotionPref, useSettings, type Tab } from './lib/store';
import { ActivitySheet, CloudSheet, MoonSheet } from './sheets/DetailSheets';
import { LocationSheet } from './sheets/LocationSheet';
import { SettingsSheet } from './sheets/SettingsSheet';
import { CamerasScreen } from './screens/Cameras';
import { ClearNowSheet } from './sheets/ClearNowSheet';
import { SpaceScreen } from './screens/Space';
import { TonightScreen, type SheetId } from './screens/Tonight';
import { AuroraSky } from './sky/AuroraSky';
import { Glass, RefractionDefs } from './ui/Glass';
import { TabBar } from './ui/TabBar';

const MapScreen = lazy(() => import('./screens/MapScreen'));

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

export default function App() {
  const { nightVision, reduceTransparency, lowPower, tab, setTab, reduceMotion } = useSettings();
  const reduced = useReducedMotionPref();
  const online = useOnline();
  const c = useConditions();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const [dir, setDir] = useState(1);
  const [camId, setCamId] = useState<string | null>(null);
  const [clearNow, setClearNow] = useState(false);

  useEffect(() => applyPrefs({ nightVision, reduceTransparency, lowPower }), [nightVision, reduceTransparency, lowPower]);
  useTilt(!reduced && !lowPower);

  // Glass tint follows the aurora colour (score ramp). Night Vision keeps its own red tokens.
  useEffect(() => {
    const root = document.documentElement;
    if (nightVision) root.style.removeProperty('--aurora-rgb');
    else root.style.setProperty('--aurora-rgb', scoreColor(c.score?.score ?? 15).join(' '));
  }, [c.score?.score, nightVision]);

  // Hash ⇄ tab (deep links, back button)
  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.replace(/^#\/?/, '');
      if (isTab(h)) setTab(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [setTab]);

  const go = (t: Tab) => {
    setDir(ORDER.indexOf(t) >= ORDER.indexOf(tab) ? 1 : -1);
    setTab(t);
    history.replaceState(null, '', `#/${t}`);
  };

  const screen = (() => {
    switch (tab) {
      case 'tonight':
        return <TonightScreen c={c} open={setSheet} />;
      case 'space':
        return <SpaceScreen c={c} />;
      case 'map':
        return (
          <Suspense fallback={<div className="grid min-h-dvh place-items-center"><div className="skeleton h-10 w-48 rounded-full" /></div>}>
            <MapScreen
              c={c}
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
      <AuroraSky params={c.sky} night={nightVision} reducedMotion={reduced} lowPower={lowPower} />

      <AnimatePresence>
        {!online && (
          <motion.div className="fixed inset-x-0 top-0 flex justify-center px-4 pt-[max(10px,env(safe-area-inset-top))]" style={{ zIndex: 'var(--z-toast)' }} initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}>
            <Glass radius="pill" role="status" className="flex items-center gap-2 px-4 py-2 text-[13px]">
              <CloudOff size={15} strokeWidth={1.5} aria-hidden /> Offline — showing saved data. Sun & moon stay live.
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

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
      <SettingsSheet open={sheet === 'settings'} onClose={close} />
      <LocationSheet open={sheet === 'location'} onClose={close} />
      <ClearNowSheet
        open={clearNow}
        onClose={() => setClearNow(false)}
        onOpenCamera={(id) => {
          setClearNow(false);
          go('cameras');
          setCamId(id);
        }}
      />
    </MotionConfig>
  );
}
