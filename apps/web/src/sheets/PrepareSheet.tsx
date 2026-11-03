import { track } from '../lib/telemetry';
import { formatAge } from '@nordurljos/core';
import { CloudDownload } from 'lucide-react';
import { useRef, useState } from 'react';
import { prepareForTonight, type PrepStep } from '../lib/prepare';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/** Offline-first field mode: pin a region and pre-download everything for tonight. */
export function PrepareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { location, pinnedRadiusKm, lastPrepared, set } = useSettings();
  const [step, setStep] = useState<PrepStep | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const run = async () => {
    abort.current = new AbortController();
    setResult(null);
    try {
      const r = await prepareForTonight(location, pinnedRadiusKm, setStep, abort.current.signal);
      track('prepare.run');
      set('lastPrepared', { at: new Date().toISOString(), label: location.label, radiusKm: pinnedRadiusKm });
      setResult(r.failed ? `Done. ${r.requests - r.failed} of ${r.requests} items saved (some sources were unavailable).` : `Done. ${r.requests} items saved for offline use.`);
    } finally {
      setStep(null);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Prepare for tonight"
      initial="full"
      detents={['half', 'full']}
      header={<StatHeader id="prepare" icon={CloudDownload} label="Offline field mode" value="Prepare for tonight's drive" />}
    >
      <p className="text-[15px] leading-relaxed text-ink-2">
        Saves the forecast, score, clouds, warnings, road conditions, the best spots, camera snapshots and the map around <span className="text-ink">{location.label}</span>, so the app keeps working when signal drops.
      </p>
      <Segmented
        label="Pinned area"
        value={String(pinnedRadiusKm)}
        options={[50, 150, 300].map((k) => ({ value: String(k), label: `${k} km` }))}
        onChange={(v) => set('pinnedRadiusKm', Number(v))}
      />
      {step ? (
        <div className="mt-4" role="status">
          <div className="mb-1 flex justify-between text-[13px] text-ink-2">
            <span>{step.label}…</span>
            <span className="tabular-nums">
              {step.done}/{step.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]">
            <div className="h-full rounded-full bg-[rgb(var(--aurora-rgb))] transition-[width]" style={{ width: `${(step.done / Math.max(1, step.total)) * 100}%` }} />
          </div>
          <button className="mt-2 min-h-[44px] text-[14px] text-ink-2" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <Press variant="accent" hapticKind="select" onClick={run} className="mt-4 h-14 w-full text-[16px]">
          <CloudDownload size={18} strokeWidth={1.75} aria-hidden /> Prepare for tonight's drive
        </Press>
      )}
      {result && <p className="mt-3 text-[14px] text-good">{result}</p>}
      {lastPrepared && <p className="mt-3 text-[13px] text-ink-3">Last prepared {formatAge(lastPrepared.at)} around {lastPrepared.label} ({lastPrepared.radiusKm} km).</p>}
      <p className="mt-4 pb-8 text-[12px] leading-relaxed text-ink-3">
        Uses Wi-Fi or mobile data now (about 10–30 MB). Sightings and journal entries you make offline are queued and sent automatically when signal returns.
      </p>
    </Sheet>
  );
}
