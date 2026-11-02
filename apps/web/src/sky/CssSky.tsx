/** Fallback sky when WebGL is unavailable: layered blurred gradients. */
export function CssSky({ intensity }: { intensity: number }) {
  const o = 0.1 + intensity * 0.5;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ background: 'linear-gradient(to bottom, var(--c-base-0), var(--c-base-2))' }}>
      <div className="absolute -left-1/4 top-[8%] h-[38%] w-[150%] rounded-[50%] blur-3xl" style={{ background: `radial-gradient(ellipse, rgb(var(--aurora-rgb) / ${o}), transparent 70%)` }} />
      <div className="absolute -left-1/4 top-[2%] h-[26%] w-[150%] rounded-[50%] blur-3xl" style={{ background: `radial-gradient(ellipse, rgb(167 139 250 / ${o * 0.6}), transparent 70%)` }} />
    </div>
  );
}
