import type { NightPlan, SunState } from '@nordurljos/core';
import { bzFactor, cloudFactor, darknessFactorView, hhmm, kpFactor, moonFactor, type Factor } from '../lib/explain';
import { FactorRow } from './FactorRow';

/**
 * Phase-1 hero: shows each ingredient with a traffic light. The weighted 0–100
 * Aurora Score + verdict replaces the headline in Phase 2 (logic in @nordurljos/core).
 */
export function ConditionsHero({
  sun,
  plan,
  effectiveCloud,
  kp,
  bz,
}: {
  sun: SunState;
  plan: NightPlan;
  effectiveCloud: number | null;
  kp: number | null;
  bz: number | null;
}) {
  const dark = darknessFactorView(sun.darkness);
  const factors: [string, Factor][] = [
    ['Darkness', dark],
    ['Clouds', cloudFactor(effectiveCloud)],
    ['Activity', kpFactor(kp)],
    ['Bz (IMF)', bzFactor(bz)],
    ['Moon', moonFactor(plan.moon.illumination, plan.moon.altitudeDeg)],
  ];
  const blocker = factors.find(([, f]) => f.level === 'bad');

  let headline: string;
  let sub: string;
  if (sun.darkness === 'day' || sun.darkness === 'civil') {
    headline = plan.noDarkness ? 'No darkness tonight' : `Dark from ${hhmm(plan.darkStart)}`;
    sub = 'Too bright for aurora right now. Here is how tonight is shaping up.';
  } else if (blocker) {
    headline = `Held back by ${blocker[0].toLowerCase()}`;
    sub = blocker[1].sentence;
  } else {
    headline = 'Conditions look promising';
    sub = 'Get away from lights and look north. Give your eyes 15 minutes to adjust.';
  }

  return (
    <section aria-labelledby="hero-h" className="rounded-3xl border border-line bg-surface/85 p-5 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Right now</p>
      <h2 id="hero-h" className="mt-1 text-3xl font-bold leading-tight">{headline}</h2>
      <p className="mt-1 text-muted">{sub}</p>
      <ul className="mt-3 divide-y divide-line">
        {factors.map(([name, f]) => (
          <FactorRow key={name} name={name} factor={f} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Aurora is never guaranteed. These are forecasts, and the sky has the final say.</p>
    </section>
  );
}
