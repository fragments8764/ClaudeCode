/**
 * Subtle animated aurora backdrop. `intensity` (0–1) drives opacity and speed so the
 * background itself hints at conditions. Disabled motion respects prefers-reduced-motion.
 */
export function AuroraBackground({ intensity }: { intensity: number }) {
  const i = Math.max(0, Math.min(1, intensity));
  const opacity = 0.12 + i * 0.5;
  const speed = `${36 - i * 20}s`;
  const band = (rgbVar: string, top: string, delay: string, h: string) => (
    <div
      className="aurora-band absolute -left-1/4 w-[150%] rounded-[50%] blur-3xl"
      style={{
        top,
        height: h,
        animationDelay: delay,
        background: `radial-gradient(ellipse at center, rgb(var(${rgbVar}) / ${opacity}) 0%, rgb(var(${rgbVar}) / 0) 70%)`,
        ['--aurora-speed' as string]: speed,
      }}
    />
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {band('--aurora-1', '-8%', '0s', '42%')}
      {band('--aurora-3', '4%', '-8s', '30%')}
      {band('--aurora-2', '-14%', '-16s', '28%')}
    </div>
  );
}
