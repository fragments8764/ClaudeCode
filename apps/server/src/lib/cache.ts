/**
 * Tiny in-memory TTL cache that keeps entries past expiry ("stale") so we can
 * serve the last good value when an upstream is down. Bounded by `maxEntries` (LRU-ish).
 */
export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
  /** Hard expiry: entry is dropped after this. */
  staleUntil: number;
}

export class TtlCache {
  private map = new Map<string, CacheEntry<unknown>>();
  constructor(private maxEntries = 500, private now: () => number = Date.now) {}

  get<T>(key: string): (CacheEntry<T> & { fresh: boolean }) | null {
    const e = this.map.get(key) as CacheEntry<T> | undefined;
    if (!e) return null;
    const t = this.now();
    if (t > e.staleUntil) {
      this.map.delete(key);
      return null;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, e);
    return { ...e, fresh: t <= e.expiresAt };
  }

  set<T>(key: string, value: T, ttlMs: number, staleMs: number): CacheEntry<T> {
    const t = this.now();
    const e: CacheEntry<T> = { value, fetchedAt: t, expiresAt: t + ttlMs, staleUntil: t + ttlMs + staleMs };
    this.map.delete(key);
    this.map.set(key, e);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    return e;
  }

  get size() {
    return this.map.size;
  }
}
