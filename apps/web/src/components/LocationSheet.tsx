import { ICELAND_PLACES } from '@nordurljos/core';
import { useEffect, useRef } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useSettings } from '../lib/store';

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, error, locate } = useGeolocation();
  const { location, setLocation } = useSettings();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (status === 'ok') onClose();
  }, [status, onClose]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-line bg-surface p-0 text-fg backdrop:bg-black/70 sm:m-auto sm:max-w-md sm:rounded-3xl"
      aria-label="Choose location"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Where are you?</h2>
          <button onClick={onClose} className="min-h-12 min-w-12 rounded-2xl text-2xl text-muted" aria-label="Close">
            ×
          </button>
        </div>
        <button
          onClick={locate}
          disabled={status === 'locating'}
          className="mb-3 min-h-14 w-full rounded-2xl bg-accent px-4 text-lg font-bold text-bg disabled:opacity-60"
        >
          {status === 'locating' ? 'Finding you…' : 'Use my location'}
        </button>
        {error && <p className="mb-3 text-sm text-ok" role="alert">{error}</p>}
        <p className="mb-2 text-sm text-muted">Or pick a base:</p>
        <ul className="grid grid-cols-2 gap-2">
          {ICELAND_PLACES.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setLocation({ lat: p.lat, lon: p.lon, label: p.name, source: 'manual', at: new Date().toISOString() });
                  onClose();
                }}
                className={`min-h-14 w-full rounded-2xl border px-3 text-left ${
                  location.source !== 'gps' && location.label === p.name ? 'border-accent' : 'border-line'
                } bg-surface-2`}
              >
                <div className="font-semibold leading-tight">{p.name}</div>
                <div className="text-xs text-muted">{p.region}</div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Your exact position stays on this device. The server only sees it rounded to about 5 km, to look up the weather.
        </p>
      </div>
    </dialog>
  );
}
