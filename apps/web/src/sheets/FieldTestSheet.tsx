import { Copy, FlaskConical, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { drainPer10Min, FPS_FLOOR, fpsByScreen, getPerf, resetPerf, usePerf } from '../lib/perf';
import { useSettings } from '../lib/store';
import { APP_VERSION, BUILD_ID } from '../lib/update';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));

/** The text you paste back: everything needed to judge a field test, no location. */
export function buildReport(manual: { start: string; end: string }): string {
  const p = getPerf();
  const s = useSettings.getState();
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const elapsed = mins(Date.now() - p.startedAt);
  const auto = drainPer10Min(p.battery);
  const ms = Number(manual.start) - Number(manual.end);
  const manualDrain = manual.start && manual.end && elapsed >= 2 ? Math.round(((ms * 10) / elapsed) * 10) / 10 : null;
  const all = p.windows.map((w) => w.fps);
  const lines = [
    `Norðurljós field test · v${APP_VERSION} (${BUILD_ID.slice(0, 16)})`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}x · standalone: ${matchMedia('(display-mode: standalone)').matches} · cores: ${nav.hardwareConcurrency ?? '?'} · memory: ${nav.deviceMemory ?? '?'} GB`,
    `Settings: lowPower=${s.lowPower} (auto=${s.autoLowPower}) nightVision=${s.nightVision} batterySaver=${s.batterySaver} reduceTransparency=${s.reduceTransparency} reduceMotion=${s.reduceMotion}`,
    `Session: ${elapsed} min`,
    `FPS overall: avg ${all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : '—'}, worst 5 s window ${all.length ? Math.round(Math.min(...all)) : '—'}, windows under ${FPS_FLOOR}: ${all.filter((f) => f < FPS_FLOOR).length}/${all.length}`,
    ...fpsByScreen(p.windows).map((x) => `  ${x.screen}: avg ${x.avg}, worst ${x.worst} (${x.windows} × 5 s)`),
    `Auto Low power: ${p.autoLowPowerAt ? `switched on at ${new Date(p.autoLowPowerAt).toISOString().slice(11, 19)} UTC` : 'not triggered'}`,
    `Battery (auto): ${p.batterySupported === false ? 'not available in this browser' : auto != null ? `${auto} %-points per 10 min` : 'need 2+ min unplugged'}${p.battery.length ? ` · now ${Math.round(p.battery[p.battery.length - 1]!.level * 100)}%${p.battery[p.battery.length - 1]!.charging ? ' charging' : ''}` : ''}`,
    `Battery (typed): ${manual.start || '?'}% → ${manual.end || '?'}%${manualDrain != null ? ` = ${manualDrain} %-points per 10 min` : ''}`,
    `Long tasks: ${p.longTasks} (${Math.round(p.longTaskMs)} ms)${mem ? ` · JS heap ${Math.round(mem.usedJSHeapSize / 1e6)} MB` : ''}`,
    `Errors: ${p.errors.length}`,
    ...p.errors.map((e) => `  ${new Date(e.at).toISOString().slice(11, 19)} ${e.message}`),
  ];
  return lines.join('\n');
}

export function FieldTestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePerf();
  const [manual, setManual] = useState({ start: '', end: '' });
  const [copied, setCopied] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [open]);
  const last = p.windows[p.windows.length - 1];
  const all = p.windows.map((w) => w.fps);
  const drain = drainPer10Min(p.battery);
  const copy = async () => {
    const text = buildReport(manual);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it into the chat.');
    } catch {
      // older iOS: select a hidden textarea instead
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied('Copied.');
    }
    setTimeout(() => setCopied(''), 4000);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Field test" initial="full" detents={['half', 'full']} header={<StatHeader id="fieldtest" icon={FlaskConical} label="Field test" value={last ? `${Math.round(last.fps)} fps now` : 'Measuring…'} tone={last && last.fps < FPS_FLOOR ? 'text-fair' : undefined} />}>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Use the app normally for 10–20 minutes (unplugged), then tap Copy report and paste it back. Frame rate is measured every 5 seconds on whatever screen you're on.
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['Average', all.length ? `${Math.round(all.reduce((a, b) => a + b, 0) / all.length)}` : '—', 'fps'],
          ['Worst', all.length ? `${Math.round(Math.min(...all))}` : '—', 'fps'],
          ['Session', String(mins(Date.now() - p.startedAt)), 'min'],
        ].map(([k, v, u]) => (
          <div key={k} className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] py-3">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">{k}</dt>
            <dd className="font-display text-[26px] font-light tabular-nums">
              {v}
              <span className="ml-1 text-[12px] text-ink-3">{u}</span>
            </dd>
          </div>
        ))}
      </dl>
      <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
        {fpsByScreen(p.windows).map((x) => (
          <li key={x.screen} className="flex justify-between">
            <span className="capitalize">{x.screen}</span>
            <span className="tabular-nums">
              avg {x.avg} · worst {x.worst}
            </span>
          </li>
        ))}
      </ul>
      {p.autoLowPowerAt && <p className="mt-3 text-[13px] text-fair">Low power switched on automatically: frame rate stayed under {FPS_FLOOR} fps.</p>}

      <h3 className="mb-1 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Battery</h3>
      {p.batterySupported ? (
        <p className="text-[14px] text-ink-2">{drain != null ? `${drain} %-points per 10 minutes` : 'Keep it unplugged for a few minutes…'}</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-3">This browser hides the battery level (iPhones do). Type the % from your status bar at the start and the end.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['start', 'end'] as const).map((k) => (
              <label key={k} className="text-[13px] text-ink-2">
                {k === 'start' ? 'At start' : 'Now'}
                <input
                  inputMode="numeric"
                  value={manual[k]}
                  onChange={(e) => setManual({ ...manual, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  className="mt-1 h-12 w-full rounded-[var(--r-md)] bg-[rgb(255_255_255/0.06)] px-3 text-[17px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]"
                  aria-label={`Battery percent ${k === 'start' ? 'at start' : 'now'}`}
                />
              </label>
            ))}
          </div>
        </>
      )}

      <h3 className="mb-1 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Errors</h3>
      <p className="text-[14px] text-ink-2">{p.errors.length ? `${p.errors.length} caught (included in the report)` : 'None so far.'}</p>

      <div className="mt-6 flex gap-2 pb-8">
        <Press variant="accent" onClick={copy} className="h-14 flex-1 text-[16px] font-medium">
          <Copy size={17} strokeWidth={1.75} aria-hidden /> {copied || 'Copy report'}
        </Press>
        <Press onClick={() => (resetPerf(), setManual({ start: '', end: '' }))} className="h-14 px-5" aria-label="Start a new session">
          <RotateCcw size={17} strokeWidth={1.75} aria-hidden />
        </Press>
      </div>
    </Sheet>
  );
}
