import type { CloudLayers, NightPlan } from '@nordurljos/core';
import { hhmm } from '../lib/explain';
import { Card } from './Card';
import { NightTimeline } from './NightTimeline';

export function TonightCard({ plan, clouds }: { plan: NightPlan; clouds: CloudLayers[] }) {
  const items: [string, string][] = [
    ['Sunset', hhmm(plan.sunset)],
    ['Dark from', plan.darkNow ? 'Now' : hhmm(plan.darkStart)],
    ['Dark until', hhmm(plan.darkEnd)],
    ['Sunrise', hhmm(plan.sunrise)],
    ['Moonrise', hhmm(plan.moonrise)],
    ['Moonset', hhmm(plan.moonset)],
  ];
  return (
    <Card title="Tonight" right={<span className="text-xs text-muted">{plan.moon.phaseName} · {Math.round(plan.moon.illumination * 100)}%</span>}>
      {plan.noDarkness ? (
        <p className="mb-3 text-ok">No real darkness in the next 24 h (bright summer nights). Aurora can't be seen.</p>
      ) : null}
      <dl className="mb-4 grid grid-cols-3 gap-x-3 gap-y-2">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <NightTimeline plan={plan} clouds={clouds} illumination={plan.moon.illumination} />
    </Card>
  );
}
