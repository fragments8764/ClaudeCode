# Changelog

## 0.3.0 — Design overhaul, step 1 (2026-11-02)

### Added
- **Design system** (`apps/web/src/design/`): tokens for colour, glass, radius, spacing, shadow, motion, type and layers;
  Night Vision / reduced-transparency / low-power / refraction modes as `<html>` attributes; JS springs and score colour ramp.
- **Liquid glass** recipe with gradient edge highlight, tilt/drag-driven specular sheen (DeviceOrientation, iOS permission on first tap),
  SVG displacement refraction on Chromium with plain-blur fallback elsewhere, live aurora tint, solid frosted fallback.
- **Live aurora sky:** WebGL1 shader (curtains with height-stratified colour, rays, twinkling stars, tilt parallax) driven by Kp, Bz,
  solar-wind speed and the score; 60 fps cap, paused when hidden, 30 fps/half-res in Low power, still frame under Reduce motion,
  CSS fallback without WebGL.
- **Tonight hero:** giant thin score ring (spring count-up, rotating gradient grey→teal→green→magenta, glow), one-line verdict,
  limiting factor, freshness; three glass stat pills that morph (shared element) into **Cloud / Activity / Moon sheets**;
  best-window card with live countdown.
- **Floating glass tab bar** (Tonight · Map · Cameras · Space) with a sliding liquid pill; spring tab transitions; hash deep links.
- **Draggable bottom sheets** (peek/half/full, spring + rubber-band, flick to dismiss, Esc/close button, focus management).
- **Settings:** Night Vision, Reduce motion, Reduce transparency, Low power, Haptics, Units (°C·m/s / °F·mph), Language (EN; others
  marked coming), alert thresholds (saved for push in Phase 6), live data-source status and credits.
- **Space tab** re-skinned: Kp bars (24 h + 3-day), Bz / speed / density sparklines with gradient fills and glowing current dot.
- Glass press feedback (0.96 scale, glow ripple, haptic), glass skeleton loaders, offline glass toast, `?demo=` design preview.
- Lucide thin-stroke icons; Inter Variable self-hosted (SF Pro used where the OS provides it).

### Changed
- Phase 1 screens replaced by the new system. Night mode renamed **Night Vision** (settings migrate automatically).

### Known limitations
- Map and Cameras tabs are calm placeholders (built in their phases).
- Verified in headless Chromium only (iPhone-sized viewport). **Not yet tested on real iOS Safari / Android Chrome**; headless uses
  software WebGL so frame rates there are not representative.
- JS bundle grew to ~160 KB gzip (motion + icons); code-splitting comes with the performance pass.
- Celebration moment, pull-to-refresh ribbon, onboarding, share card, ambient mode, sound: step 3.

## 0.2.0 — Phase 2 data (2026-11-02)

### Added
- OVATION parser + `ovationAt()` (overhead and distance-weighted "visible within ~800 km").
- **Aurora Score** (`packages/core/src/score.ts`): `100 × activity × sky × dark × moon`, documented tunable `WEIGHTS`, verdict,
  limiting factor, missing-input reporting; hourly outlook + best 2-hour window.
- `/api/aurora`, `/api/score`.

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
