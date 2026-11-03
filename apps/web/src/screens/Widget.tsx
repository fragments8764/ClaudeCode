import type { Conditions } from '../lib/conditions';
import { hhmm } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSettings } from '../lib/store';
import { ScoreRing } from '../ui/ScoreRing';

/**
 * Compact "widget" view (#/widget): just the score ring, verdict and place.
 * Pin it via the manifest shortcut or Add to Home Screen; native widgets need the Capacitor build.
 */
export function WidgetScreen({ c }: { c: Conditions }) {
  const { location, nightVision } = useSettings();
  const t = useT();
  return (
    <a href="#/tonight" className="grid min-h-dvh place-items-center px-6 text-center" aria-label="Open Norðurljós">
      <div>
        <ScoreRing score={c.score?.score ?? null} size={220} night={nightVision} />
        <div className="on-sky mt-4 font-display text-2xl font-light">{c.score ? t(`verdict.${c.score.verdict}`) : ''}</div>
        <div className="on-sky text-[14px] text-ink-2">
          {location.label}
          {c.best ? ` · ${hhmm(c.best.start)}–${hhmm(c.best.end)}` : ''}
        </div>
      </div>
    </a>
  );
}
