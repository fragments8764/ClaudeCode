import { formatAge } from '@nordurljos/core';
import { useHealth } from '../lib/api';
import { useSettings, type Language, type TriState, type Units } from '../lib/store';
import { Section, Segmented, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';

const TRI: { value: TriState; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const LANGS: { value: Language; label: string; disabled?: boolean }[] = [
  { value: 'en', label: 'EN' },
  { value: 'is', label: 'IS', disabled: true },
  { value: 'de', label: 'DE', disabled: true },
  { value: 'fr', label: 'FR', disabled: true },
  { value: 'zh', label: '中', disabled: true },
  { value: 'ja', label: '日', disabled: true },
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

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Settings" initial="full" detents={['half', 'full']}>
      <Section title="Display">
        <Toggle label="Night Vision" hint="Dim red everything — keeps your eyes dark-adapted" checked={s.nightVision} onChange={(v) => s.set('nightVision', v)} />
        <Segmented label="Reduce motion" value={s.reduceMotion} options={TRI} onChange={(v) => s.set('reduceMotion', v)} />
        <Segmented label="Reduce transparency" value={s.reduceTransparency} options={TRI} onChange={(v) => s.set('reduceTransparency', v)} />
        <Toggle label="Low power" hint="Calmer sky at 30 fps, lighter glass — saves battery in the cold" checked={s.lowPower} onChange={(v) => s.set('lowPower', v)} />
      </Section>

      <Section title="Feedback">
        <Toggle label="Haptics" hint="Subtle taps on key actions (Android; iOS in the app version)" checked={s.haptics} onChange={(v) => s.set('haptics', v)} />
        <Toggle label="Ambient sound" hint="Soft pad that follows aurora strength — coming soon" checked={s.sound} onChange={(v) => s.set('sound', v)} disabled />
        <Toggle label="“Go now” chime" hint="Coming soon" checked={s.chime} onChange={(v) => s.set('chime', v)} disabled />
      </Section>

      <Section title="Units & language">
        <Segmented<Units> label="Units" value={s.units} options={[{ value: 'metric', label: '°C · m/s' }, { value: 'imperial', label: '°F · mph' }]} onChange={(v) => s.set('units', v)} />
        <Segmented<Language> label="Language" value={s.language} options={LANGS} onChange={(v) => s.set('language', v)} />
        <p className="pb-2 text-[12px] text-ink-3">Íslenska, Deutsch, Français, 中文 and 日本語 are on the way.</p>
      </Section>

      <Section title="Alerts">
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
        <p className="pb-2 text-[12px] text-ink-3">
          Quiet hours {s.alerts.quietStart}–{s.alerts.quietEnd}. Push notifications switch on in the next update; your thresholds are saved.
        </p>
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
