import type { LatLon } from './types';

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Snap a coordinate to a grid (default 0.05° ≈ 5 km in latitude).
 * Used for cache keys and to avoid sending precise user locations upstream.
 */
export function snapCoord(value: number, step = 0.05): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(4));
}

export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Rough bounding box of Iceland incl. coastal waters. */
export function isInIceland({ lat, lon }: LatLon): boolean {
  return lat >= 63.0 && lat <= 67.0 && lon >= -25.0 && lon <= -13.0;
}

export interface Place extends LatLon {
  id: string;
  name: string;
  region: string;
}

/** Quick-pick bases for when GPS is unavailable. */
export const ICELAND_PLACES: Place[] = [
  { id: 'reykjavik', name: 'Reykjavík', region: 'Capital', lat: 64.1466, lon: -21.9426 },
  { id: 'keflavik', name: 'Keflavík', region: 'Reykjanes', lat: 64.0049, lon: -22.5624 },
  { id: 'thingvellir', name: 'Þingvellir', region: 'South', lat: 64.2559, lon: -21.1299 },
  { id: 'selfoss', name: 'Selfoss', region: 'South', lat: 63.9331, lon: -20.9971 },
  { id: 'vik', name: 'Vík', region: 'South', lat: 63.4186, lon: -19.006 },
  { id: 'jokulsarlon', name: 'Jökulsárlón', region: 'South-east', lat: 64.0784, lon: -16.2306 },
  { id: 'hofn', name: 'Höfn', region: 'South-east', lat: 64.2539, lon: -15.2082 },
  { id: 'egilsstadir', name: 'Egilsstaðir', region: 'East', lat: 65.2669, lon: -14.3948 },
  { id: 'myvatn', name: 'Mývatn', region: 'North', lat: 65.6039, lon: -16.9961 },
  { id: 'akureyri', name: 'Akureyri', region: 'North', lat: 65.6885, lon: -18.1262 },
  { id: 'isafjordur', name: 'Ísafjörður', region: 'Westfjords', lat: 66.0749, lon: -23.1351 },
  { id: 'grundarfjordur', name: 'Grundarfjörður', region: 'Snæfellsnes', lat: 64.9246, lon: -23.2617 },
];

/** Convert a bearing in degrees (0 = north) to a 16-point compass label. */
export function compassLabel(bearingDeg: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return pts[idx]!;
}

/** Aurora bases beyond Iceland. Score, clouds, darkness, moon and the aurora oval work
 *  anywhere; Iceland-only extras (roads, IMO warnings, ceilometers, curated spots, cloud
 *  map) switch off outside Iceland — see isIceland(). */
export const ARCTIC_PLACES: (Place & { country: string })[] = [
  { id: 'tromso', name: 'Tromsø', region: 'Norway', country: 'NO', lat: 69.6496, lon: 18.956 },
  { id: 'alta', name: 'Alta', region: 'Norway', country: 'NO', lat: 69.9689, lon: 23.2716 },
  { id: 'abisko', name: 'Abisko', region: 'Sweden', country: 'SE', lat: 68.3495, lon: 18.8312 },
  { id: 'rovaniemi', name: 'Rovaniemi', region: 'Finland', country: 'FI', lat: 66.5039, lon: 25.7294 },
  { id: 'saariselka', name: 'Saariselkä', region: 'Finland', country: 'FI', lat: 68.4183, lon: 27.4103 },
  { id: 'kangerlussuaq', name: 'Kangerlussuaq', region: 'Greenland', country: 'GL', lat: 67.0086, lon: -50.6892 },
  { id: 'nuuk', name: 'Nuuk', region: 'Greenland', country: 'GL', lat: 64.1814, lon: -51.6941 },
  { id: 'yellowknife', name: 'Yellowknife', region: 'Canada', country: 'CA', lat: 62.454, lon: -114.3718 },
  { id: 'whitehorse', name: 'Whitehorse', region: 'Canada', country: 'CA', lat: 60.7212, lon: -135.0568 },
  { id: 'churchill', name: 'Churchill', region: 'Canada', country: 'CA', lat: 58.7684, lon: -94.165 },
  { id: 'fairbanks', name: 'Fairbanks', region: 'Alaska', country: 'US', lat: 64.8378, lon: -147.7164 },
  { id: 'coldfoot', name: 'Coldfoot', region: 'Alaska', country: 'US', lat: 67.2525, lon: -150.1772 },
];

/** Roughly Iceland (incl. a coastal margin). */
export const isIceland = (lat: number, lon: number) => lat >= 62.8 && lat <= 67.2 && lon >= -25.5 && lon <= -12.5;
