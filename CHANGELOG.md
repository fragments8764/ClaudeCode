# Changelog

## 1.2.0 — Auto-update (2026-11-03)

- The app now updates itself: it checks for a new version every 30 minutes, when it comes back to the foreground and
  when the network returns (before, browsers only checked on navigation or once a day).
- New versions are applied at a safe moment: in the background, on reopening, or after 20 s idle with no sheet open,
  no text field focused and not in driving mode. Before, the page could reload mid-tap. A "Updated to v…" toast follows.
- If a code chunk from the previous deploy is gone, the app reloads once instead of breaking a screen.
- Settings → App: version, build date and "Check for updates" (applies immediately).

## 1.1.0 — Addendum Tiers 1–6 (2026-11-03)

### Tier 1 — Reliability
- Data health sheet: every source as ok / stale / down / idle with age vs expected refresh; stale and offline badges on numbers.
- Score validation loop: score log, morning "Did you see it?" push, `/admin` calibration dashboard, `npm run backtest` on real OMNI2 nights (storm avg 77 vs quiet 14 under clear skies; see `docs/backtest.md`).
- Score weights moved to versioned `config/score-weights.json`.
- Offline field mode: "Prepare for tonight" caches data + tiles around you; reports queue in an outbox and send when back online.

### Tier 2 — Safety
- Road-condition and IMO warning layers on the map; route corridor hazards (warnings, gusts ≥ 15 m/s, gravel roads).
- Shareable trip plans with live location, check-in, and an overdue push; context safety tips.

### Tier 3 — Smarter forecasting
- Cloud-gap hunter: where and when it clears within your drive limit, with leave-by and head-back times.
- 5-night outlook from NOAA 3-day + 27-day outlook and Open-Meteo 6-day cloud.
- Personal limits: max drive, darkness threshold, camera vs naked eye, favourite spots.

### Tier 4 — Field tools
- Tonight's checklist, battery saver, driving mode (auto-detect, large type, optional spoken alerts), photo shot log with suggestions.

### Tier 5 — Community
- Verified sightings (≥ 2 nearby reports), optional photo, private sightings, report/hide moderation and admin review, live map layer, weekly feed.

### Tier 6 — Product basics & quality
- Approximate location by default with precise-once; export / delete my data; opt-in analytics and crash reports.
- Sources & credits sheet with each provider's terms; server-side feature flags (`config/features.json`).
- Rarely used sheets lazy-loaded on first open (first-load JS 196 KB gzip).
- Quality: 168 tests (parsers on recorded fixtures, scoring, cloud gaps, corridor, poor-signal/offline); axe 0 violations on all new sheets; Android Chrome emulation on slow 3G.

### Changed
- All-sky cameras from UiT, SGO/Sodankylä and AuroraMAX are now link-out only (terms require permission for public display).
- Open-Meteo: optional `OPEN_METEO_API_KEY` (paid host) for commercial use.

## 1.0.0 — All phases complete (2026-11-03)

### Phase 3 — Map
- MapLibre (lazy-loaded) on a muted OpenFreeMap dark style: OVATION oval as a soft glow, cloud cover as translucent mist
  cross-fading per hour, darkness terminator (sun < −12°), NASA VIIRS light pollution, glass spot pins that pulse when
  clear & dark, camera pins, community sightings, your location; glass control cluster; layer sheet.
- Time scrubber −3 h → +48 h with magnetic hourly snap, haptic ticks, play, keyboard support and a cloud/darkness strip.

### Phase 4 — Cameras
- Config-driven camera list (`config/cameras.json`, hot-reloaded); server image proxy with status and cache; link-out
  for live streams and operators that don't allow embedding (no scraping).
- Two-column glass wall: live-dot status, distance, cloud forecast at the camera, favourites, filters, skeletons;
  fullscreen viewer with shared-element expand and swipe-down to dismiss; **timelapse** from server-side snapshots.
- **Is it clear right now?** IMO ceilometer observation (oktas, cloud base) + model + closest camera.

### Phase 5 — Planning & safety
- Best spot nearby + route list: ranks 25 curated spots (`config/spots.json`) by cloud, darkness, activity and light
  pollution; drive time; Start driving (Apple/Google Maps); tell-someone; return-time, road-condition, gust and ice warnings.
- Tonight's plan: best 2-hour window countdown, hour-by-hour forecast score, timeline (sunset, dark, moon, clear spell,
  Kp peak), night timeline.
- Safety & roads: IMO CAP warnings (with "applies here"), Vegagerðin road conditions & road-weather stations,
  call 112, SafeTravel, plan sharing, cold-night checklist; warning chip on Tonight.

### Phase 6 — Alerts & offline
- Web push end-to-end: VAPID keys (env or auto-generated), subscribe/unsubscribe/test, server poller every 5 min
  evaluating shared alert rules (score, Kp forecast, Bz south, substorm likely/onset, cloud gap) with quiet hours and
  cooldowns; expired subscriptions are pruned.
- Custom service worker (Workbox injectManifest): precache incl. map chunk, network-first API with last-good fallback,
  cache-first map tiles; "Save Iceland map for offline"; notification tap deep-links into the app.
- In-app haptic nudge + toast when the score jumps ≥ 15.

### Phase 7 — Field tools
- Substorm nowcast (Bz south duration/strength + ground magnetometer negative bay) and live INTERMAGNET magnetometer.
- Photographer mode: ISO/shutter/aperture by brightness and lens, NPF and 500-rule limits, moon-adjusted ISO,
  long-exposure timer, focus-on-a-star guide, naked-eye vs camera expectations.
- AR sky compass: camera + heading/pitch; where the oval sits (bearing & elevation with Earth curvature), moon, horizon.
- I see aurora! (anonymous ~10 km community reports, 12 h expiry) + personal journal, stats and badges, postcard export.

### Design steps 2–4
- Map and Cameras built on the design system; Tools hub; Learn (offline cheat sheet).
- Motion: "Go now" celebration (pulse + shimmer + optional chime), aurora-ribbon pull-to-refresh, staggered entrances,
  shared-element sheets, spring physics throughout, reduced-motion alternatives.
- Onboarding (3 glass cards, sky brightens as you progress); shareable story card (1080×1920, rendered on device);
  Ambient mode (Wake Lock, auto-dim); ambient sound pad; `#/widget` view + manifest shortcuts.
- i18n: EN, IS, DE, FR, 中文, 日本語 for all main chrome.
- Performance: rarely-used tools code-split and idle-prefetched; first-load JS ~180 KB gzip.
- Accessibility: axe-core WCAG 2.1 AA — 0 violations across all main screens and sheets (fixed: button utility
  override via CSS layers, tertiary text contrast, heading order, focusable scroll regions, ARIA on map markers).

### Fixed along the way
- MapLibre worker not emitted by the bundler → bundled explicitly via `?worker&url`.
- MapLibre's `position: relative` collapsed the full-bleed map; transformed tab wrapper broke `position: fixed`.
- Sheets/viewers trapped under the tab bar → portalled to `<body>`.
- Substorm "loading" state diluted by a 30-min average → uses the continuous south run.


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
