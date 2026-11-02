import type { SourceMeta } from '../lib/types';

export function Credits({ sources }: { sources: SourceMeta[] }) {
  const unique = [...new Map(sources.map((s) => [s.attribution, s])).values()];
  return (
    <footer className="mt-6 space-y-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-muted">
      <p className="font-semibold uppercase tracking-wider">Data sources</p>
      <ul className="space-y-1">
        {unique.map((s) => (
          <li key={s.id}>
            <a href={s.homepage} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {s.attribution}
            </a>
            {!s.ok && <span className="text-bad"> · unavailable</span>}
            {s.stale && <span className="text-ok"> · showing cached</span>}
          </li>
        ))}
        <li>Sun &amp; moon computed on your device (SunCalc).</li>
      </ul>
      <p>
        <a href="#/health" className="underline underline-offset-2">Data source status</a>
      </p>
    </footer>
  );
}
