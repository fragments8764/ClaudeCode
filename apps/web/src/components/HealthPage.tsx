import { formatAge } from '@nordurljos/core';
import { useHealth } from '../lib/api';
import { Card } from './Card';

export function HealthPage() {
  const q = useHealth();
  const h = q.data;
  return (
    <div className="space-y-3">
      <a href="#/" className="inline-flex min-h-12 items-center text-accent">← Back</a>
      <Card title="Data source status" right={h && <span className={h.status === 'ok' ? 'text-good' : 'text-ok'}>{h.status}</span>}>
        {q.isError && <p className="text-bad">Can't reach the Norðurljós server.</p>}
        {!h && !q.isError && <p className="text-muted">Loading…</p>}
        <ul className="divide-y divide-line">
          {h?.sources.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                <span className={s.breaker === 'closed' && s.consecutiveFailures === 0 ? 'text-good' : s.breaker === 'open' ? 'text-bad' : 'text-ok'}>
                  {s.lastSuccessAt === null && s.requests === 0 ? 'not used yet' : s.breaker === 'closed' ? (s.consecutiveFailures ? 'flaky' : 'ok') : `circuit ${s.breaker}`}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted">
                <span>Last OK: {s.lastSuccessAt ? formatAge(s.lastSuccessAt) : '—'}</span>
                <span>Latency: {s.lastLatencyMs ?? '—'} ms</span>
                <span>Requests: {s.requests} · cache hits: {s.cacheHits}</span>
                <span>Cache TTL: {s.ttlSeconds / 60} min</span>
                {s.lastError && <span className="col-span-2 text-ok">Last error: {s.lastError} ({formatAge(s.lastFailureAt)})</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
