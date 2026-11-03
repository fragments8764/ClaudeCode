/**
 * PHOTOGRAPHER MODE: exposure suggestions for aurora.
 * Brightness levels: 0 faint (grey arc), 1 moderate, 2 bright, 3 very bright / fast-moving storm.
 */
export type Brightness = 0 | 1 | 2 | 3;

export function brightnessFrom(kp: number | null, score: number | null): Brightness {
  const k = kp ?? 2;
  if (k >= 6 || (score ?? 0) >= 80) return 3;
  if (k >= 4.5 || (score ?? 0) >= 55) return 2;
  if (k >= 3 || (score ?? 0) >= 30) return 1;
  return 0;
}

/** NPF rule (sharp stars): t = (35·N + 30·p) / f, p = pixel pitch µm, f = focal length (35mm-equivalent). */
export function npfSeconds(focalMm: number, aperture: number, pixelPitchUm = 4.3): number {
  return Math.round(((35 * aperture + 30 * pixelPitchUm) / focalMm) * 10) / 10;
}

/** Classic 500 rule (more lenient, slight trailing on high-res sensors). */
export function rule500Seconds(focalMm: number, crop = 1): number {
  return Math.round((500 / (focalMm * crop)) * 10) / 10;
}

export interface ExposureSuggestion {
  iso: number;
  shutter: number; // seconds
  aperture: number;
  note: string;
}

/**
 * Suggested exposure. Bright, fast aurora → shorter shutter to keep structure; a bright moon
 * lets you drop ISO by about a stop. Shutter never exceeds the NPF limit for sharp stars.
 */
export function suggestExposure(b: Brightness, opts: { focalMm: number; aperture: number; moonUpBright: boolean; phone?: boolean }): ExposureSuggestion {
  if (opts.phone) {
    const sh = [10, 6, 3, 2][b]!;
    return { iso: [1600, 1000, 800, 640][b]!, shutter: sh, aperture: opts.aperture, note: 'Use Night mode or Pro mode on a tripod; turn off the flash.' };
  }
  const base = [
    { iso: 3200, shutter: 15 },
    { iso: 1600, shutter: 10 },
    { iso: 1600, shutter: 4 },
    { iso: 1250, shutter: 1.5 },
  ][b]!;
  const apertureStops = Math.log2((opts.aperture / 2.8) ** 2);
  let shutter = base.shutter * 2 ** apertureStops;
  let iso = base.iso;
  if (opts.moonUpBright) iso = Math.max(400, Math.round(iso / 2));
  const limit = npfSeconds(opts.focalMm, opts.aperture);
  let note = b >= 2 ? 'Short exposures freeze the fast-moving rays.' : 'Long exposure collects a faint arc your eyes may see as grey.';
  if (shutter > limit) {
    const over = shutter / limit;
    shutter = limit;
    iso = Math.min(12800, Math.round(iso * over));
    note += ' Shutter capped at the NPF limit for sharp stars; ISO raised to compensate.';
  }
  return { iso: roundIso(iso), shutter: Math.round(shutter * 10) / 10, aperture: opts.aperture, note };
}

function roundIso(iso: number): number {
  const stops = [100, 200, 400, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800];
  return stops.reduce((a, b) => (Math.abs(b - iso) < Math.abs(a - iso) ? b : a));
}

/** What will it actually look like? Sets expectations for first-timers. */
export function expectation(b: Brightness): { eye: string; camera: string } {
  return [
    { eye: 'A faint, greyish-white arc or glow low in the north, easy to mistake for cloud.', camera: 'A clear green band. Cameras see much more colour than eyes at this level.' },
    { eye: 'A pale green arc, maybe with gentle rays. Colour is visible once your eyes adapt.', camera: 'Vivid green with structure and rays.' },
    { eye: 'Bright green curtains that move and ripple, sometimes with a pink lower edge.', camera: 'Saturated green, pink and purple, with sharp rays.' },
    { eye: 'Fast, dancing curtains across much of the sky, with green, pink and maybe red overhead.', camera: 'Full-sky colour. Use short exposures to keep the detail.' },
  ][b]!;
}
