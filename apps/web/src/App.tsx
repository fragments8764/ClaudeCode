import { planNight, sunState } from '@nordurljos/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuroraBackground } from './components/AuroraBackground';
import { CloudCard } from './components/CloudCard';
import { ConditionsHero } from './components/ConditionsHero';
import { Credits } from './components/Credits';
import { Header } from './components/Header';
import { HealthPage } from './components/HealthPage';
import { LocationSheet } from './components/LocationSheet';
import { SpaceCard } from './components/SpaceCard';
import { TonightCard } from './components/TonightCard';
import { useNow } from './hooks/useNow';
import { useClouds, useSpaceWeather } from './lib/api';
import { applyTheme, useSettings } from './lib/store';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

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
  const theme = useSettings((s) => s.theme);
  const location = useSettings((s) => s.location);
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  const route = useHashRoute();
  const online = useOnline();
  const now = useNow(60_000);

  useEffect(() => applyTheme(theme), [theme]);

  // Astronomy is local and instant — works fully offline.
  const plan = useMemo(() => planNight(now, location.lat, location.lon, 24, 5), [now, location.lat, location.lon]);
  const sun = useMemo(() => sunState(now, location.lat, location.lon), [now, location.lat, location.lon]);

  const sw = useSpaceWeather();
  const clouds = useClouds(location.lat, location.lon);

  const eff = clouds.data?.data.effective ?? null;
  const kp = sw.data?.data.kp.now?.kp ?? null;
  const bz = sw.data?.data.solarWind.latest?.bz ?? null;
  // Background glow ≈ rough proxy until the Phase-2 score drives it.
  const intensity = sun.darknessFactor * (1 - (eff ?? 50) / 100) * Math.min(1, (kp ?? 2) / 6);

  const sources = [...(sw.data?.meta.sources ?? []), ...(clouds.data?.meta.sources ?? [])];

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4">
      <AuroraBackground intensity={intensity} />
      <Header onLocation={() => setSheet(true)} />
      {!online && (
        <div role="status" className="mb-3 rounded-2xl border border-ok/50 bg-surface px-4 py-2 text-sm text-ok">
          Offline: showing the last data we saved. Sun and moon times are still live.
        </div>
      )}
      {route === '/health' ? (
        <HealthPage />
      ) : (
        <main className="space-y-3">
          {location.source === 'default' && (
            <button onClick={() => setSheet(true)} className="min-h-14 w-full rounded-2xl border border-accent/60 bg-surface px-4 text-left">
              <span className="font-semibold text-accent">Set your location</span>
              <span className="block text-sm text-muted">Showing Reykjavík. Tap to use GPS or pick a base.</span>
            </button>
          )}
          <ConditionsHero sun={sun} plan={plan} effectiveCloud={eff} kp={kp} bz={bz} />
          <CloudCard q={clouds} darkIntervals={plan.darkIntervals} />
          <TonightCard plan={plan} clouds={clouds.data?.data.hourly ?? []} />
          <SpaceCard q={sw} />
          <Credits sources={sources} />
        </main>
      )}
      <LocationSheet open={sheet} onClose={closeSheet} />
    </div>
  );
}
