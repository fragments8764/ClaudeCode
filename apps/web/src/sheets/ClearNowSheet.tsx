import { formatAge } from '@nordurljos/core';
import { ExternalLink, Eye } from 'lucide-react';
import { apiUrl, useClearNow } from '../lib/api';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/** One glance: observed cloud from the nearest IMO ceilometer + model + closest camera. */
export function ClearNowSheet({ open, onClose, onOpenCamera }: { open: boolean; onClose: () => void; onOpenCamera: (id: string) => void }) {
  const location = useSettings((s) => s.location);
  const q = useClearNow(location.lat, location.lon, open);
  const d = q.data?.data;
  const ok = d?.observed?.oktas;
  const model = d?.model?.effective ?? null;
  let verdict = 'Checking the sky…';
  let tone = '';
  if (ok != null) {
    [verdict, tone] = ok <= 2 ? ['Clear right now', 'text-good'] : ok <= 5 ? ['Broken cloud, with gaps', 'text-fair'] : ['Overcast right now', 'text-poor'];
  } else if (model != null) {
    [verdict, tone] = model <= 30 ? ['Probably clear', 'text-good'] : model <= 70 ? ['Partly cloudy', 'text-fair'] : ['Probably overcast', 'text-poor'];
  } else if (q.isError) verdict = 'Can’t check right now';
  return (
    <Sheet open={open} onClose={onClose} title="Is it clear?" initial="half" detents={['half', 'full']} header={<StatHeader id="clearnow" icon={Eye} label={location.label} value={verdict} tone={tone} />}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Observed</div>
          <div className="font-display text-3xl font-light tabular-nums">{ok == null ? '—' : `${ok}/8`}</div>
          <div className="text-[12px] text-ink-3">{d?.observed ? `${d.observed.name}, ${d.observed.distanceKm} km · ${formatAge(d.observed.time)}` : 'No ceilometer within 120 km'}</div>
        </div>
        <div className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Forecast model</div>
          <div className="font-display text-3xl font-light tabular-nums">{model == null ? '—' : `${model}%`}</div>
          <div className="text-[12px] text-ink-3">sky blocked, here</div>
        </div>
      </div>
      {d?.observed?.baseM != null && <p className="mt-3 text-[14px] text-ink-2">Lowest cloud base about {Math.round(d.observed.baseM / 100) * 100} m.</p>}
      {d?.camera && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">Closest camera · {d.camera.distanceKm} km</h3>
          {d.camera.image ? (
            <button onClick={() => onOpenCamera(d.camera!.id)} className="block w-full overflow-hidden rounded-[var(--r-lg)]">
              <img src={apiUrl(d.camera.image)} alt={`Latest from ${d.camera.name}`} className="aspect-[4/3] w-full object-cover" />
            </button>
          ) : (
            <a href={d.camera.pageUrl} target="_blank" rel="noreferrer">
              <Press className="h-14 w-full text-[15px]" tabIndex={-1}>
                <ExternalLink size={16} strokeWidth={1.75} aria-hidden /> {d.camera.name}
              </Press>
            </a>
          )}
          <p className="mt-1 text-[12px] text-ink-3">© {d.camera.attribution}</p>
        </div>
      )}
      <p className="mt-5 pb-6 text-[12px] leading-relaxed text-ink-3">
        "Observed" is cloud cover measured by the Icelandic Met Office's ceilometers, in eighths of the sky (0 = clear, 8 = overcast).
      </p>
    </Sheet>
  );
}
