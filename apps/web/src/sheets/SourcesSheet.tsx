import { useQuery } from '@tanstack/react-query';
import { BookMarked, TriangleAlert } from 'lucide-react';
import { getJson } from '../lib/api';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

interface Sources {
  providers: { provider: string; license?: string; terms?: string; url?: string; flag?: string; feeds: { id: string; name: string; attribution: string; homepage: string }[] }[];
  cameras: { id: string; name: string; attribution: string; pageUrl: string; embed: string; terms: string | null }[];
}

/** Sources & credits: every data provider and camera owner, with licence, terms and links. */
export function SourcesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: ['sources'], queryFn: () => getJson<{ data: Sources }>('/api/sources'), enabled: open, staleTime: 3600_000 });
  const d = q.data?.data;
  return (
    <Sheet open={open} onClose={onClose} title="Sources & credits" initial="full" detents={['half', 'full']} header={<StatHeader id="sources" icon={BookMarked} label="Sources & credits" value="Who makes this possible" />}>
      {!d && <div className="skeleton h-40" />}
      {d?.providers.map((p) => (
        <section key={p.provider} className="border-b border-[rgb(255_255_255/0.06)] py-3">
          <div className="flex items-baseline justify-between gap-2">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" className="text-[16px] font-medium underline-offset-4 hover:underline">{p.provider}</a>
            ) : (
              <span className="text-[16px] font-medium">{p.provider}</span>
            )}
            <span className="shrink-0 text-right text-[12px] text-ink-3">{p.license}</span>
          </div>
          {p.feeds.length > 0 && <div className="text-[12px] text-ink-3">{p.feeds.map((f) => f.name).join(' · ')}</div>}
          {p.terms && <p className="mt-1 text-[13px] leading-snug text-ink-2">{p.terms}</p>}
          {p.flag && (
            <p className="mt-1 flex gap-1.5 text-[12px] text-fair">
              <TriangleAlert size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
              {p.flag}
            </p>
          )}
        </section>
      ))}
      {d && (
        <section className="py-3">
          <h3 className="mb-1 text-[11px] uppercase tracking-[0.22em] text-ink-3">Cameras</h3>
          <ul className="space-y-2">
            {d.cameras.map((c) => (
              <li key={c.id} className="text-[13px]">
                <a href={c.pageUrl} target="_blank" rel="noreferrer" className="text-ink underline-offset-4 hover:underline">{c.name}</a> <span className="text-ink-3">© {c.attribution} · {c.embed === 'image' ? 'image shown with permission' : 'link to operator'}</span>
                {c.terms && <div className="text-[12px] text-ink-3">{c.terms}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="pb-8 pt-2 text-[12px] text-ink-3">Sun and moon are calculated on your phone with SunCalc (BSD). Icons: Lucide (ISC). Font: Inter (OFL).</p>
    </Sheet>
  );
}
