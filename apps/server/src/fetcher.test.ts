import { describe, expect, it, vi } from 'vitest';
import { Fetcher, UpstreamError } from './lib/fetcher';
import type { SourceDef } from './lib/sources';

const SRC: Record<string, SourceDef> = {
  t: { id: 't', name: 'Test', attribution: 'x', homepage: 'x', ttlMs: 1000, staleMs: 10_000, timeoutMs: 1000 },
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number) => new Response('nope', { status });

function setup(responses: (() => Response | Promise<Response>)[]) {
  let clock = 0;
  const fetch = vi.fn(async () => {
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r();
  });
  const f = new Fetcher(SRC, {
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    retries: 1,
    breakerThreshold: 2,
    breakerCooldownMs: 5000,
    sleep: async () => {},
  });
  return { f, fetch, tick: (ms: number) => (clock += ms) };
}

const id = (x: unknown) => x;

describe('Fetcher', () => {
  it('caches fresh values', async () => {
    const { f, fetch } = setup([() => ok({ a: 1 })]);
    expect((await f.get('t', 'u', id)).value).toEqual({ a: 1 });
    expect((await f.get('t', 'u', id)).value).toEqual({ a: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.healthReport()[0]!.cacheHits).toBe(1);
  });

  it('coalesces concurrent requests', async () => {
    const { f, fetch } = setup([() => ok(1)]);
    const [a, b] = await Promise.all([f.get('t', 'u', id), f.get('t', 'u', id)]);
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx then succeeds', async () => {
    const { f, fetch } = setup([() => fail(503), () => ok(2)]);
    expect((await f.get('t', 'u', id)).value).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx (except 429)', async () => {
    const { f, fetch } = setup([() => fail(404), () => ok(2)]);
    await expect(f.get('t', 'u', id)).rejects.toBeInstanceOf(UpstreamError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('serves stale data when upstream fails after TTL', async () => {
    const { f, tick } = setup([() => ok('v1'), () => fail(500), () => fail(500)]);
    await f.get('t', 'u', id);
    tick(2000);
    const r = await f.get('t', 'u', id);
    expect(r).toMatchObject({ value: 'v1', stale: true });
    expect(f.healthReport()[0]!.lastError).toContain('HTTP 500');
  });

  it('treats parse errors as failures and serves stale', async () => {
    const { f, tick } = setup([() => ok('v1'), () => ok('bad')]);
    const parse = (x: unknown) => {
      if (x === 'bad') throw new Error('parse');
      return x;
    };
    await f.get('t', 'u', parse);
    tick(2000);
    expect(await f.get('t', 'u', parse)).toMatchObject({ value: 'v1', stale: true });
  });

  it('opens the circuit after threshold, then half-opens after cooldown', async () => {
    const { f, fetch, tick } = setup([() => fail(500), () => fail(500), () => fail(500), () => fail(500), () => ok('back')]);
    await expect(f.get('t', 'a', id)).rejects.toThrow();
    await expect(f.get('t', 'b', id)).rejects.toThrow();
    expect(f.healthReport()[0]!.breaker).toBe('open');
    const calls = fetch.mock.calls.length;
    await expect(f.get('t', 'c', id)).rejects.toThrow(/circuit open/);
    expect(fetch.mock.calls.length).toBe(calls); // no upstream call while open
    tick(5000);
    expect(f.healthReport()[0]!.breaker).toBe('half-open');
    expect((await f.get('t', 'd', id)).value).toBe('back');
    expect(f.healthReport()[0]!.breaker).toBe('closed');
  });

  it('drops entries after the stale window', async () => {
    const { f, tick } = setup([() => ok('v1'), () => fail(500), () => fail(500)]);
    await f.get('t', 'u', id);
    tick(20_000);
    await expect(f.get('t', 'u', id)).rejects.toThrow();
  });
});
