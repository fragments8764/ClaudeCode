# QA report: audit, fixes, refinements (v1.2 → v1.3, 4 Nov 2026)

## How it was tested

| What | How |
| --- | --- |
| Devices | Headless Chromium 1.x with **Android Chrome emulation** (Pixel-7 viewport/UA, touch) and iPhone-size viewports (375×667 SE, 390×844, 320×568). **Not tested on a physical iPhone/iOS Safari or Android phone**: WebKit can't be installed in this environment. |
| Network | Slow 3G (400 kbps, 400 ms RTT) + 4× CPU throttle; offline; service-worker warm cache |
| Data correctness | App output vs **NOAA SWPC** (Kp), **Open-Meteo** direct (cloud), **US Naval Observatory** API (sun/moon rise & set) for Reykjavík, Akureyri, Vík (moon also Tromsø, Anchorage), 30–60 days |
| Performance | rAF frame times + Long Tasks API during a full scrubber drag; CDP main-thread busy %, JS heap, DOM nodes over 60 s idle per screen; CPU profile |
| Accessibility | axe-core (WCAG 2.1 AA) on all 4 tabs × default / reduced motion + transparency / Night Vision; tap-target sizes; unlabeled controls; backdrop-filter count |
| Edge cases | Phone in another timezone, midnight sun (clock set to 21 Jun), location denied (fresh install), offline first visit, very long place name on a 320 px screen, camera image failing, locations outside Iceland |

## Bugs, ranked by severity

No crashes: **0 page errors** in every scripted run.

| # | Severity | Bug | Repro | Status | Regression test |
| --- | --- | --- | --- | --- | --- |
| 1 | Wrong data | **Moonrise/moonset wrong by 15 min on average, up to 49 min** (SunCalc's moon is geocentric and low-precision; at 64°N it rises at a shallow angle) | Moon sheet, Reykjavík 4 Nov: moonset 16:21 vs USNO 16:09 | **Fixed**: compact Meeus ephemeris + topocentric horizon. Now **mean 16 s, max 1 min** over 116 events | `almanac.test.ts` (recorded USNO fixture) |
| 2 | Wrong data | **Times shown in the phone's timezone, not the location's** | Phone in New York, location Reykjavík → moonset shown 11:09 | **Fixed**: `/api/timezone` + location-local formatting everywhere; Moon sheet says which zone | `web.test.ts`, `tier6.test.ts` |
| 3 | Wrong data | **Disagreeing cloud models averaged** (Open-Meteo 91 %, MET Norway 31 % → "61 %") | Reykjavík 4 Nov 20:00 | **Fixed**: when spread > 35, the nearest IMO ceilometer (≤ 40 km, ≤ 90 min old) picks the model; Cloud sheet explains it | `forecasting.test.ts` |
| 4 | Wrong data | **"Call 112" shown in Canada/Alaska** (911 there) | Location Fairbanks → Safety | **Fixed**: 112/911 by location timezone | `web.test.ts` |
| 5 | Jank | **Map timeline drag glitched**: thumb fought the finger (spring per hour), and each hour re-rendered the cloud layer with a canvas blur + PNG encode (~280 ms) | Map → drag the time slider quickly | **Fixed**: finger-following thumb, cached/pre-rendered low-res cloud images, async CPU-side encoding, no cross-fade while dragging | Measured (below) |
| 6 | Broken layout | Midnight sun: "Wait for darkness" with no date | Clock 21 Jun → Tonight | **Fixed**: "Too bright for aurora · Dark skies return around 9 August" | `almanac.test.ts` |
| 7 | Broken layout | Text crowding: durations wrapping mid-way ("1h / 01m"), two-column footers wrapping, safety rows "Wind — · gusts —", duplicate road conditions, truncated camera names, "Confidence" row overlapping its value, Tools cards of uneven height | 375 px screen, several sheets | **Fixed** | `forecasting.test.ts` (non-breaking durations) |
| 8 | Broken layout | Tiny screens (320×568): Cloud/Kp/Moon pills under the tab bar; toast covering the location button | iPhone SE 1st gen size | **Fixed**: responsive hero; toast below the header | Screenshot check |
| 9 | Broken layout | Places outside Iceland shown as raw coordinates when found by GPS | GPS in Tromsø → "69.65°, 18.96°" | **Fixed** | `web.test.ts` |
| 10 | Jank / battery | 52 blurred glass markers on the map, 22 nested blurs on Cameras; "Reduce transparency" still ran a backdrop pass | Count `backdrop-filter` | **Fixed**: solid markers, no nested blur, reduced transparency drops the pass | Audit script |
| 11 | Accessibility | Tap targets < 44 px: map pins 26 px, camera chips/stars 40 px | Measure | **Fixed** (44 px hit areas) | Audit script |
| 12 | Accessibility | Night Vision text contrast 2.4–2.9:1 | axe, Night Vision | **Fixed** (all ≥ 4.5:1) | axe re-run: 0 |
| 13 | Broken state | Failed camera image showed a loading shimmer forever | Block a camera URL | **Fixed**: "Not responding · retrying" with back-off; retry button in the viewer | Manual |
| 14 | Cosmetic | Map camera markers piled on top of spots at country zoom; attribution "i" touching the screen edge; stale "arrive in a later build" copy; Score sheet "Now" (forecast-only 4) ≠ ring (16) | Map, Space, Score sheet | **Fixed** | Manual |

## Data correctness (4 Nov 2026, ~20:00 UTC)

| Check | Reykjavík | Akureyri | Vík | Verdict |
| --- | --- | --- | --- | --- |
| Kp vs NOAA latest 3-h | 1.0 vs 1.0 | — | — | ✅ exact |
| Cloud (our Open-Meteo leg vs Open-Meteo direct) | 91 vs 94 % | 3 vs 0 % | 100 vs 100 % | ✅ (time step differs by 15 min) |
| Cloud consensus | 61 % (models 91/31) | | | ⚠️ fixed (bug 3) |
| Sunset vs USNO | +2 min | +2 min | +2 min | ✅ within tolerance (test allows 3) |
| Moonset vs USNO (before → after) | +12 → 0 min | +12 → 0 min | +11 → 0 min | ✅ fixed (bug 1) |
| Aurora Score | 15 (limited by activity) | 46 | 0 (overcast) | ✅ consistent with inputs; no external reference exists for our own score |

vedur.is has no machine-readable aurora forecast; it is cross-checked through the IMO warnings and ceilometer feeds the app already uses.

## Performance

| Metric | Before | After |
| --- | --- | --- |
| Main-thread blocking during a full scrubber drag (4× CPU) | **49.8 s** | **1.7 s** |
| Worst frame during the drag | 2,183 ms | 417 ms |
| Scrubber thumb moving against the finger | yes (spring per hour) | no |
| Cold load, slow 3G + 4× CPU: score ring visible | 6.0 s | 6.1 s |
| Warm load (service worker), slow 3G | 1.06 s | 0.89 s |
| First-load JS (gzip) | 196 KB | 197 KB (new sheets are lazy chunks) |
| Idle main-thread busy (60 s): Tonight / Map / Cameras / Space | — | 2.8 % / 3.6 % / 1.7 % / 1.5 % |
| JS heap: Tonight / Map | — | 5 MB / 13 MB |

Headless Chromium renders WebGL in software, so absolute frame rates (5–9 fps here, even idle) are not representative of a phone GPU. The fix is measured by main-thread blocking, which is.

**Battery drain over 10 minutes was not measured**: there's no real device here. Best proxy: main-thread CPU is under 4 % on every screen when idle. The GPU cost of the animated sky and glass is the real battery driver; Low power (30 fps sky, lighter glass) and Battery saver (still sky, red, refresh ×3 slower) exist for the field.

## Accessibility

axe-core WCAG 2.1 AA: **0 violations** on all tabs in default and reduced motion/transparency modes, and now 0 in Night Vision (was 2). New sheets (Why this score, Bz, speed, density, regions, beta feedback) also 0. All controls labelled; charts are keyboard sliders with spoken values.

## Not done / needs a real device

- iOS Safari and a physical Android phone (install, push, haptics, Night Vision on OLED, battery).
- Live video playback: YouTube refuses to play in this sandbox's headless browser (even for its own public test videos), so the player was verified up to load, not playback.
- Score weights unchanged: tuning needs real "Did you see it?" answers; the pipeline is in place (`/admin`).
