import { levelColor, levelDot, levelLabel, type Factor } from '../lib/explain';

export function FactorRow({ name, factor }: { name: string; factor: Factor }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${levelDot[factor.level]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{name}</span>
          <span className={`font-semibold tabular-nums ${levelColor[factor.level]}`}>
            {factor.value}
            <span className="sr-only">, {levelLabel[factor.level]}</span>
          </span>
        </div>
        <p className="text-sm leading-snug text-muted">{factor.sentence}</p>
      </div>
    </li>
  );
}
