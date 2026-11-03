import { formatAge } from '@nordurljos/core';
import { useEffect, useRef, useState } from 'react';
import { useHealth } from '../lib/api';
import { saveIcelandOffline } from '../lib/offlineMap';
import { currentSubscription, disablePush, enablePush, pushSupport, syncPush, testPush } from '../lib/push';
import { Press } from '../ui/Button';
import { useSettings, type Language, type TriState, type Units } from '../lib/store';
import { Section, Segmented, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { useT } from '../lib/i18n';
import { APP_VERSION, BUILD_ID, checkForUpdate, getUpdateStatus, onUpdateStatus, type UpdateStatus } from '../lib/update';

const TRI: { value: TriState; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const LANGS: { value: Language; label: string; disabled?: boolean }[] = [
  { value: 'en', label: 'EN' },
  { value: 'is', label: 'IS' },
  { value: 'de', label: 'DE' },
  { value: 'fr', label: 'FR' },
  { value: 'zh', label: '中' },
  { value: 'ja', label: '日' },
];

function DataSources() {
  const q = useHealth();
  return (
    <div className="py-2">
      {q.isError && <p className="py-2 text-[14px] text-poor">Can't reach the Norðurljós server.</p>}
      {q.data?.sources.map((s) => {
        const ok = s.breaker === 'closed' && s.consecutiveFailures === 0;
        const unused = s.requests === 0 && !s.lastSuccessAt;
        return (
          <div key={s.id} className="flex items-center gap-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${unused ? 'bg-ink-3' : ok ? 'bg-good' : s.breaker === 'open' ? 'bg-poor' : 'bg-fair'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <a href={s.homepage} target="_blank" rel="noreferrer" className="block truncate text-[14px]">
                {s.name}
              </a>
              <div className="truncate text-[12px] text-ink-3">
                {unused ? 'not used yet' : s.lastSuccessAt ? `OK ${formatAge(s.lastSuccessAt)}` : 'never succeeded'}
                {s.lastError && !ok ? ` · ${s.lastError}` : ''} · {s.attribution}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen?: (what: 'privacy' | 'sources' | 'health') => void }) {
  const s = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Settings" initial="full" detents={['half', 'full']}>
      <Section title="Display">
        <Toggle label="Night Vision" hint="Dim red everything — keeps your eyes dark-adapted" checked={s.nightVision} onChange={(v) => s.set('nightVision', v)} />
        <Segmented label="Reduce motion" value={s.reduceMotion} options={TRI} onChange={(v) => s.set('reduceMotion', v)} />
        <Segmented label="Reduce transparency" value={s.reduceTransparency} options={TRI} onChange={(v) => s.set('reduceTransparency', v)} />
        <Toggle label="Low power" hint="Calmer sky at 30 fps, lighter glass — saves battery in the cold" checked={s.lowPower} onChange={(v) => s.set('lowPower', v)} />
        <Toggle label="Battery saver" hint="One tap: red-only, dimmed, still sky, refresh 3× less often, camera feeds paused. Alerts still arrive." checked={s.batterySaver} onChange={(v) => s.set('batterySaver', v)} />
      </Section>

      <Section title="Your preferences">
        <Segmented
          label="Longest drive I'll make"
          value={String(s.maxDriveMin)}
          options={[30, 60, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h` }))}
          onChange={(v) => s.set('maxDriveMin', Number(v))}
        />
        <Segmented
          label="How dark it must be"
          value={s.minDarkness}
          options={[
            { value: 'nautical', label: 'Dark enough' },
            { value: 'astronomical', label: 'Fully dark' },
          ]}
          onChange={(v) => s.set('minDarkness', v)}
        />
        <Toggle label="I'm bringing a camera" hint="Adds tripod & batteries to the checklist and keeps Photographer mode handy" checked={s.hasCamera} onChange={(v) => s.set('hasCamera', v)} />
        <p className="pb-2 text-[12px] text-ink-3">
          {s.favoriteSpots.length} favourite spot{s.favoriteSpots.length === 1 ? '' : 's'} (star them on the map). Used to rank spots, find cloud gaps and tune alerts, and stored only on this device.
        </p>
      </Section>

      <Section title="Feedback">
        <Toggle label="Spoken alerts" hint="Reads out big changes (e.g. “Aurora burst starting now, Kp 6”) while the app is open" checked={s.spokenAlerts} onChange={(v) => s.set('spokenAlerts', v)} />
        <Toggle label="Auto driving mode" hint="Big, glanceable screen when GPS says you're moving; nothing to tap while driving" checked={s.autoDriving} onChange={(v) => s.set('autoDriving', v)} />
        <Toggle label="Haptics" hint="Subtle taps on key actions (Android; iOS in the app version)" checked={s.haptics} onChange={(v) => s.set('haptics', v)} />
        <Toggle label="Ambient sound" hint="A very soft pad that swells with aurora strength" checked={s.sound} onChange={(v) => s.set('sound', v)} />
        <Toggle label="“Go now” chime" hint="A gentle chime when the score crosses into Go" checked={s.chime} onChange={(v) => s.set('chime', v)} />
      </Section>

      <Section title="Units & language">
        <Segmented<Units> label="Units" value={s.units} options={[{ value: 'metric', label: '°C · m/s' }, { value: 'imperial', label: '°F · mph' }]} onChange={(v) => s.set('units', v)} />
        <Segmented<Language> label="Language" value={s.language} options={LANGS} onChange={(v) => s.set('language', v)} />
        <p className="pb-2 text-[12px] text-ink-3">Main screens are translated; detailed explanations are in English for now.</p>
      </Section>

      <Section title="Alerts">
        <PushToggle />
        <Segmented
          label="Notify me when the score reaches"
          value={String(s.alerts.minScore)}
          options={['30', '50', '70'].map((v) => ({ value: v, label: v }))}
          onChange={(v) => s.set('alerts', { ...s.alerts, minScore: Number(v) })}
        />
        <Segmented
          label="…or Kp forecast reaches"
          value={String(s.alerts.minKp)}
          options={['3', '4', '5', '6'].map((v) => ({ value: v, label: `Kp ${v}` }))}
          onChange={(v) => s.set('alerts', { ...s.alerts, minKp: Number(v) })}
        />
        <Toggle label="Bz turns strongly south" checked={s.alerts.bzSouth} onChange={(v) => s.set('alerts', { ...s.alerts, bzSouth: v })} />
        <Segmented
          label="Quiet hours"
          value={`${s.alerts.quietStart}-${s.alerts.quietEnd}`}
          options={[
            { value: '00:00-00:00', label: 'Off' },
            { value: '02:00-07:00', label: '02–07' },
            { value: '23:00-07:00', label: '23–07' },
            { value: '09:00-17:00', label: 'Day' },
          ]}
          onChange={(v) => {
            const [a, b] = v.split('-');
            s.set('alerts', { ...s.alerts, quietStart: a!, quietEnd: b! });
          }}
        />
        <p className="pb-2 text-[12px] text-ink-3">During quiet hours only a real substorm onset with a high score can wake you. Alerts use the location set above.</p>
      </Section>

      <Section title="Offline">
        <OfflineMap />
      </Section>

      <Section title="Privacy & data">
        {(
          [
            ['privacy', 'Privacy', 'What we keep, export or delete your data'],
            ['sources', 'Sources & credits', 'Every data provider and camera owner'],
            ['health', 'Data health', 'Live status of every source'],
          ] as const
        ).map(([k, label, hint]) => (
          <button key={k} onClick={() => onOpen?.(k)} className="flex min-h-[56px] w-full items-center justify-between py-2 text-left">
            <span>
              <span className="block text-[15px] font-medium">{label}</span>
              <span className="block text-[13px] text-ink-3">{hint}</span>
            </span>
            <span className="text-ink-3" aria-hidden>›</span>
          </button>
        ))}
      </Section>

      <Section title="App">
        <AppVersion />
      </Section>

      <Section title="Data sources">
        <DataSources />
        <p className="pb-6 pt-1 text-[12px] leading-relaxed text-ink-3">
          Sun and moon are computed on your phone. Weather data: Open-Meteo and MET Norway (CC BY 4.0). Space weather: NOAA SWPC.
          Aurora is never guaranteed — these are forecasts.
        </p>
      </Section>
    </Sheet>
  );
}

function PushToggle() {
  const alerts = useSettings((s) => s.alerts);
  const location = useSettings((s) => s.location);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const support = pushSupport();
  useEffect(() => {
    currentSubscription().then((x) => setOn(!!x)).catch(() => {});
  }, []);
  // keep the server's copy of thresholds & location in sync
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (on) syncPush().catch(() => {});
  }, [alerts, location, on]);
  const hint =
    support === 'needs-install'
      ? 'On iPhone: Share → Add to Home Screen, then open Norðurljós from there to allow notifications.'
      : support === 'denied'
        ? 'Notifications are blocked in your browser settings.'
        : support === 'unsupported'
          ? 'This browser does not support push notifications.'
          : 'Aurora, Bz and clearing alerts, even when the app is closed.';
  return (
    <>
      <Toggle
        label="Push notifications"
        hint={hint}
        checked={on}
        disabled={busy || support !== 'ok'}
        onChange={async (v) => {
          setBusy(true);
          setMsg('');
          try {
            if (v) await enablePush();
            else await disablePush();
            setOn(v);
            setMsg(v ? 'Alerts are on.' : 'Alerts are off.');
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {on && (
        <button className="mb-2 min-h-[44px] text-[14px] text-ink-2 underline underline-offset-4" onClick={() => testPush().then(() => setMsg('Test sent.')).catch((e) => setMsg((e as Error).message))}>
          Send a test notification
        </button>
      )}
      {msg && <p className="pb-2 text-[13px] text-ink-2" role="status">{msg}</p>}
    </>
  );
}

function OfflineMap() {
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nl-offline-map');
    } catch {
      return null;
    }
  });
  const abort = useRef<AbortController | null>(null);
  const run = async () => {
    abort.current = new AbortController();
    setState({ done: 0, total: 1 });
    try {
      await saveIcelandOffline((done, total) => setState({ done, total }), abort.current.signal);
      const t = new Date().toISOString();
      try {
        localStorage.setItem('nl-offline-map', t);
      } catch {
        /* ignore */
      }
      setSaved(t);
    } finally {
      setState(null);
    }
  };
  return (
    <div className="py-2">
      <div className="text-[15px] font-medium">Save Iceland map for offline</div>
      <div className="mb-2 text-[13px] text-ink-3">
        About 15–25 MB of map tiles for the whole island, so the map works in dead zones. {saved ? `Last saved ${formatAge(saved)}.` : ''}
      </div>
      {state ? (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
            <div className="h-full rounded-full bg-[rgb(var(--aurora-rgb))] transition-[width]" style={{ width: `${(state.done / state.total) * 100}%` }} />
          </div>
          <button className="min-h-[44px] text-[14px] text-ink-2" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <Press onClick={run} className="h-12 w-full text-[15px]">
          {saved ? 'Update offline map' : 'Download map'}
        </Press>
      )}
      <p className="mt-2 text-[12px] text-ink-3">Forecasts, spots, cameras list and the Learn guide are saved automatically each time you open the app.</p>
    </div>
  );
}

function AppVersion() {
  const t = useT();
  const [st, setSt] = useState<UpdateStatus>(getUpdateStatus);
  useEffect(() => onUpdateStatus(setSt), []);
  const label =
    st === 'checking' ? t('update.checking') : st === 'current' ? t('update.current') : st === 'ready' ? t('update.ready') : st === 'offline' ? t('update.offline') : t('update.check');
  const built = BUILD_ID === 'dev' ? 'dev build' : new Date(BUILD_ID).toLocaleDateString();
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-[15px] font-medium">{t('update.version', { v: APP_VERSION })}</span>
        <span className="block text-[13px] text-ink-3">
          {built} · {t('update.auto')}
        </span>
      </span>
      {st !== 'unsupported' && (
        <Press onClick={() => void checkForUpdate(true)} disabled={st === 'checking'} className="h-11 shrink-0 px-4 text-[13px]" aria-live="polite">
          {label}
        </Press>
      )}
    </div>
  );
}
