import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';

export interface GlassProps extends HTMLMotionProps<'div'> {
  strong?: boolean;
  /** SVG displacement refraction at the edges (Chromium only; others: plain blur). Use sparingly. */
  refract?: boolean;
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'pill';
}

const R = { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)', pill: 'var(--r-pill)' };

/** The one glass surface. Every floating element is built on this. */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass({ strong, refract, radius = 'lg', className = '', style, ...rest }, ref) {
  return (
    <motion.div
      ref={ref}
      className={`glass ${strong ? 'glass-strong' : ''} ${refract ? 'glass-refract' : ''} ${className}`}
      style={{ borderRadius: R[radius], ...style }}
      {...rest}
    />
  );
});

/**
 * SVG filter used by .glass-refract: a gentle, edge-weighted displacement that bends
 * what's behind the glass like a thick lens. Rendered once at app root.
 */
export function RefractionDefs() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="lg-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="28" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
