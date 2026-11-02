# Changelog

## 0.1.0 — Phase 1: Foundation (2026-11-02)

### Added
- **Monorepo** (npm workspaces): `packages/core` (pure logic), `apps/server` (Hono API proxy), `apps/web` (React PWA).
- **Astronomy (on-device, offline):** sun altitude/twilight classification, darkness factor, moon altitude/bearing/illumination/phase,
  24 h night plan (sunset, dark window at sun < −12°, astronomical dark, sunrise, moonrise/set). Sampling-based, so it stays correct
  through polar night and midnight sun, where SunCalc's named times return NaN.
- **API proxy** with per-source TTL cache, stale-on-error fallback, request coalescing, retries with backoff, circuit breakers,
  coordinate snapping (~5 km, for privacy and cache hits) and `/api/health`.
  - `GET /api/space-weather`: Kp now / 24 h peak / 3-day series, G-scale, solar wind speed & density, Bz/Bt (latest, 15-min avg, 6 h series).
  - `GET /api/clouds?lat&lon`: Open-Meteo + MET Norway cross-checked; low/mid/high layers; "effective" sky-blocking %; confidence; temp/wind.
  - `GET /api/health`: per-source status.
- **Web app:** dark theme + **red night-vision mode** (applied before first paint, so there is no white flash), GPS or quick-pick location,
  "Right now" conditions hero with per-factor traffic lights and plain-language explanations, cloud card, tonight timeline
  (sky darkness / moon / hourly cloud), compact space-weather card with Bz sparkline, data freshness everywhere, source credits,
  health page, aurora background tied to conditions, offline banner.
- **PWA:** installable manifest + icons, service worker precache, NetworkFirst API cache, last-known-good data in localStorage.
- **Tests:** 44 (astronomy, geo, all parsers against real captured fixtures, fetcher cache/breaker/retry, API routes).

### Verified upstream changes (important)
- NOAA `products/solar-wind/plasma-*.json` and `mag-*.json` are **gone (404)**. Replaced by `json/rtsw/rtsw_{wind,mag}_1m.json`,
  which mixes ACE / IMAP / SOLAR1 records; we use the one flagged `active` (currently SOLAR1).
- NOAA Kp JSON is now an array of objects (was array-of-arrays). Both formats are accepted.

### Known limitations
- No Aurora Score yet (Phase 2). The hero shows ingredients plus the limiting factor only.
- OVATION is not used yet (Phase 2/3), so activity is judged from Kp alone, not from oval position at your exact location.
- Cache is in-memory (resets on restart; per instance). Fine for one Node instance; use KV/Cache API on Workers.
- `npm audit` lists moderate/low advisories in **build-time** workbox tooling (glob/minimatch/ejs via workbox-build). Nothing ships to
  the browser or server; no upstream fix yet.
- English only. i18n is Phase 8.
