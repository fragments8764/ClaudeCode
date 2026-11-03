/** Fixed-window per-key limiter (e.g. per IP) for write endpoints. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}
  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t >= h.reset) {
      this.hits.set(key, { n: 1, reset: t + this.windowMs });
      if (this.hits.size > 10_000) this.hits.clear();
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
}
