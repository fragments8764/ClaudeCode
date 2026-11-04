/**
 * Compact lunar ephemeris (Meeus, "Astronomical Algorithms", ch. 47, main periodic terms)
 * plus the topocentric rise/set horizon.
 *
 * Why: SunCalc's moon is geocentric and low-precision. At Iceland's latitude the moon
 * rises and sets at a shallow angle, so its ~1° parallax and small position errors turned
 * into moonrise/moonset times that were off by 15 min on average (up to 49 min) against
 * the US Naval Observatory. This keeps the bundle small (no 47 KB ephemeris library).
 */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const norm = (d: number) => ((d % 360) + 360) % 360;

// [D, M, M', F, Σl, Σr]  (Table 47.A, terms ≥ 2000e-6°)
const LR: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];
// [D, M, M', F, Σb]  (Table 47.B, terms ≥ 1700e-6°)
const B: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];

export interface MoonEquatorial {
  /** right ascension, degrees */
  ra: number;
  /** declination, degrees */
  dec: number;
  /** Earth–Moon distance, km */
  distanceKm: number;
}

const jd = (d: Date) => d.getTime() / 86400000 + 2440587.5;

export function moonEquatorial(date: Date): MoonEquatorial {
  const T = (jd(date) - 2451545) / 36525;
  const Lp = norm(218.3164477 + 481267.88123421 * T);
  const D = norm(297.8501921 + 445267.1114034 * T);
  const M = norm(357.5291092 + 35999.0502909 * T);
  const Mp = norm(134.9633964 + 477198.8675055 * T);
  const F = norm(93.272095 + 483202.0175233 * T);
  const E = 1 - 0.002516 * T;
  const A1 = norm(119.75 + 131.849 * T);
  const A2 = norm(53.09 + 479264.29 * T);
  const A3 = norm(313.45 + 481266.484 * T);
  let sl = 0;
  let sr = 0;
  let sb = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * D2R;
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sl += l * e * Math.sin(arg);
    sr += r * e * Math.cos(arg);
  }
  for (const [d, m, mp, f, b] of B) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sb += b * e * Math.sin((d * D + m * M + mp * Mp + f * F) * D2R);
  }
  sl += 3958 * Math.sin(A1 * D2R) + 1962 * Math.sin((Lp - F) * D2R) + 318 * Math.sin(A2 * D2R);
  sb += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3 * D2R) + 175 * Math.sin((A1 - F) * D2R) + 175 * Math.sin((A1 + F) * D2R) + 127 * Math.sin((Lp - Mp) * D2R) - 115 * Math.sin((Lp + Mp) * D2R);
  const lam = (Lp + sl / 1e6) * D2R;
  const bet = (sb / 1e6) * D2R;
  const eps = (23.439291 - 0.0130042 * T) * D2R;
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  return { ra: norm(ra * R2D), dec: dec * R2D, distanceKm: 385000.56 + sr / 1000 };
}

/** Geocentric geometric altitude (no refraction, no parallax), degrees. */
function geoAltitude(date: Date, lat: number, lon: number, m: MoonEquatorial): number {
  const gmst = norm(280.46061837 + 360.98564736629 * (jd(date) - 2451545));
  const H = (gmst + lon - m.ra) * D2R;
  const phi = lat * D2R;
  const dec = m.dec * D2R;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) * R2D;
}

/** Horizontal parallax, degrees (~0.9–1.0°). */
export const moonParallaxDeg = (distanceKm: number) => Math.asin(6378.14 / distanceKm) * R2D;

/**
 * Moon altitude relative to its rise/set horizon, degrees: 0 exactly at moonrise/moonset
 * (upper limb on the horizon, standard refraction, topocentric parallax — Meeus h0 =
 * 0.7275·π − 0.5667°), positive while the moon is up.
 */
export function moonAltitudeDeg(date: Date, lat: number, lon: number): number {
  const m = moonEquatorial(date);
  return geoAltitude(date, lat, lon, m) - (0.7275 * moonParallaxDeg(m.distanceKm) - 0.5667);
}
