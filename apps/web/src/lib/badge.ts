import { useEffect } from 'react';
import { useSettings } from './store';

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** App Badging API: iOS 16.4+ (installed to the Home Screen, notifications allowed), Chrome/Edge. */
export const badgeSupported = () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

/** Keeps the home-screen icon badge equal to the current score while enabled. */
export function useIconBadge(score: number | null | undefined) {
  const on = useSettings((s) => s.iconBadge);
  useEffect(() => {
    const nav = navigator as BadgeNav;
    // let the service worker know (it updates the badge from push alerts while the app is closed)
    caches
      ?.open('prefs')
      .then(async (c) => void (on ? await c.put('/__pref/icon-badge', new Response('1')) : await c.delete('/__pref/icon-badge')))
      .catch(() => {});
    if (!nav.setAppBadge) return;
    if (on && score != null && score > 0) nav.setAppBadge(Math.round(score)).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [on, score]);
}
