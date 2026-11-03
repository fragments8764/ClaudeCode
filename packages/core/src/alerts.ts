/**
 * ALERT RULES (pure). The server poller evaluates these per subscriber; the app uses the
 * same rules for in-app nudges. Each rule has a cooldown so people aren't spammed.
 */
export type AlertRule = 'score' | 'kp-forecast' | 'bz-south' | 'substorm' | 'clearing';

export interface AlertPrefsLike {
  minScore: number;
  minKp: number;
  bzSouth: boolean;
  /** "HH:MM" local */
  quietStart: string;
  quietEnd: string;
  /** IANA tz, e.g. "Atlantic/Reykjavik" */
  tz?: string;
  /** personalisation: darkness factor required (0.6 ≈ nautical, 0.95 ≈ astronomical) */
  minDark?: number;
}

export interface AlertState {
  score: number;
  dark: number; // darkness factor 0–1
  cloud: number | null;
  kpMaxNext3h: number | null;
  bzAvg15: number | null;
  nowcast: 'quiet' | 'loading' | 'likely' | 'onset';
  /** Hours until the next ≥30 % clearing during darkness (null if none). */
  clearingInHours: number | null;
  placeLabel: string;
}

export interface AlertMessage {
  rule: AlertRule;
  title: string;
  body: string;
  tag: string;
}

export const COOLDOWN_MIN: Record<AlertRule, number> = {
  score: 180,
  'kp-forecast': 360,
  'bz-south': 120,
  substorm: 90,
  clearing: 240,
};

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True if `now` falls inside quiet hours (handles windows that wrap past midnight). */
export function inQuietHours(now: Date, prefs: Pick<AlertPrefsLike, 'quietStart' | 'quietEnd' | 'tz'>): boolean {
  let hh: number;
  let mm: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: prefs.tz || 'UTC' }).formatToParts(now);
    hh = Number(parts.find((p) => p.type === 'hour')?.value);
    mm = Number(parts.find((p) => p.type === 'minute')?.value);
  } catch {
    hh = now.getUTCHours();
    mm = now.getUTCMinutes();
  }
  const t = hh * 60 + mm;
  const s = minutesOfDay(prefs.quietStart);
  const e = minutesOfDay(prefs.quietEnd);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * Decide which alerts to send now. `lastSent` maps rule → ISO time of last send.
 * Quiet hours suppress everything except an actual substorm onset with a high score.
 */
export function evaluateAlerts(state: AlertState, prefs: AlertPrefsLike, lastSent: Partial<Record<AlertRule, string>>, now: Date): AlertMessage[] {
  const quiet = inQuietHours(now, prefs);
  const cooled = (r: AlertRule) => {
    const t = lastSent[r];
    return !t || now.getTime() - new Date(t).getTime() >= COOLDOWN_MIN[r] * 60_000;
  };
  const out: AlertMessage[] = [];
  const at = state.placeLabel;
  const dark = state.dark >= (prefs.minDark ?? 0.6);
  const clearish = state.cloud === null || state.cloud <= 50;

  if (state.nowcast === 'onset' && dark && clearish && cooled('substorm') && (!quiet || state.score >= 50)) {
    out.push({ rule: 'substorm', title: 'Aurora kicking off now', body: `Magnetometers show a substorm. Score ${state.score} at ${at}. Look up!`, tag: 'substorm' });
  }
  if (quiet) return out;
  if (dark && state.score >= prefs.minScore && cooled('score')) {
    out.push({ rule: 'score', title: `Go outside: score ${state.score}`, body: `Dark, ${state.cloud ?? '?'}% cloud and active skies at ${at}.`, tag: 'score' });
  }
  if (state.nowcast === 'likely' && dark && clearish && cooled('substorm') && !out.some((m) => m.rule === 'substorm')) {
    out.push({ rule: 'substorm', title: 'Burst likely in 30–60 min', body: `Bz has been south for a while. Head to your spot near ${at}.`, tag: 'substorm' });
  }
  if (prefs.bzSouth && state.bzAvg15 !== null && state.bzAvg15 <= -8 && dark && clearish && cooled('bz-south')) {
    out.push({ rule: 'bz-south', title: 'Bz flipped strongly south', body: `Bz ${state.bzAvg15.toFixed(1)} nT: the door is open. Watch the sky at ${at}.`, tag: 'bz' });
  }
  if (state.kpMaxNext3h !== null && state.kpMaxNext3h >= prefs.minKp && cooled('kp-forecast')) {
    out.push({ rule: 'kp-forecast', title: `Kp ${state.kpMaxNext3h.toFixed(1)} forecast`, body: `Activity is expected to rise in the next 3 h. ${state.cloud != null ? `${state.cloud}% cloud at ${at} now.` : ''}`.trim(), tag: 'kp' });
  }
  if (!clearish && state.clearingInHours !== null && state.clearingInHours <= 1.5 && state.score >= 10 && cooled('clearing')) {
    out.push({ rule: 'clearing', title: 'Cloud gap opening', body: `Skies should clear near ${at} within ${Math.max(1, Math.round(state.clearingInHours * 60))} min.`, tag: 'clearing' });
  }
  return out;
}
