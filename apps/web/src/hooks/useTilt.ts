import { useEffect } from 'react';

/**
 * Device tilt → CSS vars --tilt-x / --tilt-y (−1…1) on <html>, plus a shared mutable
 * object the WebGL sky reads each frame. No React re-renders.
 * Sources: DeviceOrientation (phones), finger drag / pointer position (fallback).
 * iOS needs DeviceOrientationEvent.requestPermission() from a user gesture: we ask once
 * on the first tap anywhere.
 */
export const tilt = { x: 0, y: 0 };

type IOSDeviceOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function useTilt(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      tilt.x = tilt.y = 0;
      root.style.setProperty('--tilt-x', '0');
      root.style.setProperty('--tilt-y', '0');
      return;
    }
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let lastOrientation = 0;

    const loop = () => {
      // critically-damped-ish smoothing
      tilt.x += (tx - tilt.x) * 0.08;
      tilt.y += (ty - tilt.y) * 0.08;
      root.style.setProperty('--tilt-x', tilt.x.toFixed(3));
      root.style.setProperty('--tilt-y', tilt.y.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      lastOrientation = performance.now();
      tx = Math.max(-1, Math.min(1, e.gamma / 30));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    const onPointer = (e: PointerEvent) => {
      if (performance.now() - lastOrientation < 1000) return; // real sensors win
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
    };
    const askIOS = () => {
      const D = window.DeviceOrientationEvent as IOSDeviceOrientation | undefined;
      D?.requestPermission?.().catch(() => {});
      window.removeEventListener('pointerdown', askIOS);
    };

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', askIOS, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', askIOS);
    };
  }, [enabled]);
}
