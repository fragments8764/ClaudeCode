/**
 * Contextual safety tips — shown once, dismissible, never nagging. All tips are also listed
 * in the Safety sheet. Rules use only data already on screen.
 */
export interface Tip {
  id: string;
  title: string;
  body: string;
}
export const TIPS: Tip[] = [
  { id: 'no-road-stop', title: 'Never stop on the road', body: 'Pull fully off into a parking area or pull-out. Never stop in a lane or a passing place, even for a minute of aurora.' },
  { id: 'ice', title: 'Ice forms fast at night', body: 'Road surfaces freeze well before the air does. Slow down on bridges, in shade and on black, wet-looking patches.' },
  { id: 'windchill', title: 'Dress for the wind chill', body: 'What it feels like matters more than the thermometer. Wear layers, a hat, windproof shell and warm gloves, and bring a thermos.' },
  { id: 'fuel', title: 'Keep the tank above half', body: 'Stations are far apart and some close early. You will idle with the heater on while you wait.' },
  { id: 'lights', title: 'Headlights off when parked', body: 'Kill your lights (and the interior light) at viewpoints, so you don’t blind other people’s cameras or your own eyes.' },
  { id: 'gusts', title: 'Strong gusts: hold your car door', body: 'Arctic gusts can rip a car door off its hinges. Open it with both hands, nose into the wind.' },
];

const KEY = 'nl-tips-dismissed';
export function dismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function dismissTip(id: string) {
  const s = dismissed();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

/** The most relevant undismissed tip for the moment, or null. */
export function contextualTip(ctx: { dark: boolean; score: number; feelsLike: number | null; airC: number | null; gust: number | null; planActive: boolean }): Tip | null {
  const d = dismissed();
  const want: string[] = [];
  if ((ctx.gust ?? 0) >= 15) want.push('gusts');
  if (ctx.dark && ctx.score >= 25) want.push('no-road-stop');
  if (ctx.planActive) want.push('fuel');
  if ((ctx.airC ?? 99) <= 2) want.push('ice');
  if ((ctx.feelsLike ?? 99) <= -3) want.push('windchill');
  if (ctx.dark && ctx.score >= 25) want.push('lights');
  const id = want.find((x) => !d.has(x));
  return id ? TIPS.find((t) => t.id === id)! : null;
}
