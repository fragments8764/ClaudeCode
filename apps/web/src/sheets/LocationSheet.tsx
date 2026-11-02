import { ICELAND_PLACES } from '@nordurljos/core';
import { LocateFixed } from 'lucide-react';
import { useEffect } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, error, locate } = useGeolocation();
  const { location, setLocation } = useSettings();

  useEffect(() => {
    if (status === 'ok' && open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Sheet open={open} onClose={onClose} title="Where are you?" initial="full" detents={['half', 'full']}>
      <Press variant="accent" hapticKind="select" onClick={locate} disabled={status === 'locating'} className="mt-2 h-14 w-full text-[16px] font-medium">
        <LocateFixed size={18} strokeWidth={1.75} aria-hidden />
        {status === 'locating' ? 'Finding you…' : 'Use my location'}
      </Press>
      {error && (
        <p className="mt-3 text-[14px] text-fair" role="alert">
          {error}
        </p>
      )}
      <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Or pick a base</h3>
      <ul className="grid grid-cols-2 gap-2">
        {ICELAND_PLACES.map((p) => {
          const active = location.source !== 'gps' && location.label === p.name;
          return (
            <li key={p.id}>
              <Press
                radius="lg"
                hapticKind="select"
                onClick={() => {
                  setLocation({ lat: p.lat, lon: p.lon, label: p.name, source: 'manual', at: new Date().toISOString() });
                  onClose();
                }}
                className={`h-16 w-full px-4 ${active ? 'shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.7)]' : ''}`}
                aria-pressed={active}
              >
                <span className="flex w-full flex-col items-start">
                  <span className="text-[15px] font-medium leading-tight">{p.name}</span>
                  <span className="text-[12px] text-ink-3">{p.region}</span>
                </span>
              </Press>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 pb-4 text-[12px] leading-relaxed text-ink-3">
        Your exact position stays on this phone. The server only sees it rounded to about 5 km, to look up the weather.
      </p>
    </Sheet>
  );
}
