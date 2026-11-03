import { TtlCache } from './cache';
import type { SourceDef } from './sources';

/**
 * Resilient upstream fetcher:
 *  - per-key TTL cache, serving stale data when upstream fails
 *  - request coalescing (concurrent callers share one in-flight request)
 *  - retries with exponential backoff (network errors, 5xx, 429)
 *  - per-source circuit breaker: after N consecutive failures, stop calling
 *    upstream for a cooldown and serve stale (or fail fast)
 *  - health bookkeeping for /api/health
 */

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface SourceHealth {
  id: string;
  name: string;
  breaker: BreakerState;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  requests: number;
  cacheHits: number;
}

export interface FetchResult<T> {
  value: T;
  fetchedAt: string;
  /** True if served from cache after TTL because upstream failed / breaker open. */
  stale: boolean;
}

export interface BinaryPayload {
  bytes: Uint8Array;
  contentType: string;
  lastModified: string | null;
}

export class UpstreamError extends Error {
  constructor(public sourceId: string, message: string, public status?: number) {
    super(`${sourceId}: ${message}`);
    this.name = 'UpstreamError';
  }
}

export interface FetcherOptions {
  fetch?: typeof fetch;
  now?: () => number;
  userAgent?: string;
  retries?: number;
  backoffMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class Fetcher {
  readonly cache: TtlCache;
  private health = new Map<string, SourceHealth & { openedAt: number | null }>();
  private inflight = new Map<string, Promise<FetchResult<unknown>>>();
  private f: typeof fetch;
  private now: () => number;
  private opts: Required<Omit<FetcherOptions, 'fetch' | 'now'>>;

  constructor(private sources: Record<string, SourceDef>, opts: FetcherOptions = {}) {
    this.f = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.cache = new TtlCache(500, this.now);
    this.opts = {
      userAgent: opts.userAgent ?? 'nordurljos/0.1',
      retries: opts.retries ?? 2,
      backoffMs: opts.backoffMs ?? 400,
      breakerThreshold: opts.breakerThreshold ?? 4,
      breakerCooldownMs: opts.breakerCooldownMs ?? 2 * 60_000,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    };
    for (const s of Object.values(sources)) {
      this.health.set(s.id, {
        id: s.id,
        name: s.name,
        breaker: 'closed',
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
        lastLatencyMs: null,
        requests: 0,
        cacheHits: 0,
        openedAt: null,
      });
    }
  }

  private def(id: string): SourceDef {
    const d = this.sources[id];
    if (!d) throw new Error(`unknown source ${id}`);
    return d;
  }

  private h(id: string) {
    return this.health.get(id)!;
  }

  private breakerAllows(id: string): boolean {
    const h = this.h(id);
    if (h.breaker === 'closed') return true;
    if (h.breaker === 'open' && h.openedAt !== null && this.now() - h.openedAt >= this.opts.breakerCooldownMs) {
      h.breaker = 'half-open';
    }
    return h.breaker === 'half-open';
  }

  private recordSuccess(id: string, latency: number) {
    const h = this.h(id);
    h.breaker = 'closed';
    h.openedAt = null;
    h.consecutiveFailures = 0;
    h.lastSuccessAt = new Date(this.now()).toISOString();
    h.lastLatencyMs = latency;
  }

  private recordFailure(id: string, err: unknown) {
    const h = this.h(id);
    h.consecutiveFailures++;
    h.lastFailureAt = new Date(this.now()).toISOString();
    h.lastError = err instanceof Error ? err.message : String(err);
    if (h.breaker === 'half-open' || h.consecutiveFailures >= this.opts.breakerThreshold) {
      h.breaker = 'open';
      h.openedAt = this.now();
    }
  }

  private async fetchOnce(def: SourceDef, url: string, binary = false): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), def.timeoutMs);
    try {
      const res = await this.f(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': this.opts.userAgent, Accept: binary ? 'image/*' : 'application/json' },
      });
      if (!res.ok) throw new UpstreamError(def.id, `HTTP ${res.status}`, res.status);
      if (binary) {
        const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
        if (!/^image\//.test(contentType)) throw new UpstreamError(def.id, `not an image (${contentType})`);
        return { bytes: new Uint8Array(await res.arrayBuffer()), contentType, lastModified: res.headers.get('last-modified') } satisfies BinaryPayload;
      }
      // 204 No Content (e.g. IMO CAP with no active warnings) → null
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      const msg = (e as Error)?.name === 'AbortError' ? `timeout after ${def.timeoutMs}ms` : (e as Error)?.message ?? String(e);
      throw new UpstreamError(def.id, msg);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(def: SourceDef, url: string, binary = false): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      try {
        return await this.fetchOnce(def, url, binary);
      } catch (e) {
        lastErr = e;
        const status = e instanceof UpstreamError ? e.status : undefined;
        const retryable = status === undefined || status >= 500 || status === 429;
        if (!retryable || attempt === this.opts.retries) break;
        await this.opts.sleep(this.opts.backoffMs * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  /**
   * Get JSON from `url` for `sourceId`, parse it with `parse`, and cache the parsed value.
   * `cacheKey` defaults to the URL (use a snapped-coordinate key for location queries).
   */
  async get<T>(sourceId: string, url: string, parse: (raw: unknown) => T, cacheKey = url, binary = false): Promise<FetchResult<T>> {
    const def = this.def(sourceId);
    const h = this.h(sourceId);
    const key = `${sourceId}:${cacheKey}`;
    const cached = this.cache.get<T>(key);
    if (cached?.fresh) {
      h.cacheHits++;
      return { value: cached.value, fetchedAt: new Date(cached.fetchedAt).toISOString(), stale: false };
    }

    const serveStale = (err: unknown): FetchResult<T> => {
      if (cached) return { value: cached.value, fetchedAt: new Date(cached.fetchedAt).toISOString(), stale: true };
      throw err;
    };

    if (!this.breakerAllows(sourceId)) {
      return serveStale(new UpstreamError(sourceId, 'circuit open'));
    }

    const existing = this.inflight.get(key) as Promise<FetchResult<T>> | undefined;
    if (existing) return existing;

    const p = (async () => {
      h.requests++;
      const t0 = this.now();
      try {
        const raw = await this.fetchWithRetry(def, url, binary);
        const value = parse(raw); // ParseError counts as a source failure too
        this.recordSuccess(sourceId, this.now() - t0);
        const e = this.cache.set(key, value, this.ttlOverride.get(key) ?? def.ttlMs, def.staleMs);
        return { value, fetchedAt: new Date(e.fetchedAt).toISOString(), stale: false };
      } catch (err) {
        this.recordFailure(sourceId, err);
        return serveStale(err);
      }
    })().finally(() => this.inflight.delete(key));

    this.inflight.set(key, p as Promise<FetchResult<unknown>>);
    return p;
  }

  /** Fetch an image (cached like JSON). */
  getImage(sourceId: string, url: string, cacheKey = url, ttlOverrideMs?: number): Promise<FetchResult<BinaryPayload>> {
    if (ttlOverrideMs !== undefined) this.ttlOverride.set(`${sourceId}:${cacheKey}`, ttlOverrideMs);
    return this.get(sourceId, url, (raw) => raw as BinaryPayload, cacheKey, true);
  }

  private ttlOverride = new Map<string, number>();

  healthReport(): SourceHealth[] {
    return [...this.health.values()].map(({ openedAt: _o, ...rest }) => {
      // surface half-open transitions on read
      if (rest.breaker === 'open' && _o !== null && this.now() - _o >= this.opts.breakerCooldownMs) rest.breaker = 'half-open';
      return rest;
    });
  }
}
