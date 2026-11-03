import { haversineKm } from './geo';

/**
 * COMMUNITY SIGHTING VERIFICATION
 * A report earns "verified" when at least two independent signals agree:
 *  - corroboration: other people reported aurora within 100 km and ±60 min
 *  - magnetometer: ground-magnetometer bay ≥ 100 nT, or substorm nowcast "likely/onset" at report time
 *  - oval: NOAA OVATION puts aurora within view (≥ 10) at the report location/time
 * Each source counts at most once (two other users = one strong corroboration signal).
 */
export interface SightingSignals {
  oval: number | null;
  nowcast: 'quiet' | 'loading' | 'likely' | 'onset' | null;
  groundBay: number | null;
}

export interface SightingLite {
  id: string;
  at: string;
  lat: number;
  lon: number;
  signals?: SightingSignals;
}

export type SightingConfidence = 'unverified' | 'low' | 'medium' | 'high';

export interface Verification {
  confidence: SightingConfidence;
  verified: boolean;
  nearbyReports: number;
  reasons: string[];
}

export function verifySighting(s: SightingLite, all: SightingLite[]): Verification {
  const t = Date.parse(s.at);
  const nearby = all.filter((o) => o.id !== s.id && Math.abs(Date.parse(o.at) - t) <= 60 * 60_000 && haversineKm(s, o) <= 100).length;
  const reasons: string[] = [];
  let points = 0;
  if (nearby >= 1) {
    points += nearby >= 2 ? 2 : 1;
    reasons.push(`${nearby} other report${nearby > 1 ? 's' : ''} nearby within an hour`);
  }
  const sig = s.signals;
  if (sig && ((sig.groundBay ?? 0) >= 100 || sig.nowcast === 'likely' || sig.nowcast === 'onset')) {
    points += 1;
    reasons.push(sig.groundBay != null && sig.groundBay >= 100 ? `Magnetometer disturbance (${sig.groundBay} nT)` : `Substorm ${sig.nowcast} at the time`);
  }
  if (sig && (sig.oval ?? 0) >= 10) {
    points += 1;
    reasons.push(`Aurora oval within view (OVATION ${sig.oval})`);
  }
  const confidence: SightingConfidence = points >= 3 ? 'high' : points === 2 ? 'medium' : points === 1 ? 'low' : 'unverified';
  return { confidence, verified: points >= 2, nearbyReports: nearby, reasons };
}

/** Weekly feed ranking: verified first, then brightness, then recency (newer wins). */
export function feedRank(x: { at: string; brightness: number; verified: boolean; featured?: boolean }, now: Date): number {
  const ageDays = (now.getTime() - Date.parse(x.at)) / 864e5;
  return (x.featured ? 100 : 0) + (x.verified ? 20 : 0) + x.brightness * 4 - ageDays * 2;
}
