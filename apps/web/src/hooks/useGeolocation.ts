import { useCallback, useEffect, useState } from 'react';
import { haversineKm, ICELAND_PLACES } from '@nordurljos/core';
import { useSettings } from '../lib/store';

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'error';

/** Friendly label for a coordinate: nearest known place if within 40 km. */
export function labelFor(lat: number, lon: number): string {
  let best = ICELAND_PLACES[0]!;
  let bestD = Infinity;
  for (const p of ICELAND_PLACES) {
    const d = haversineKm({ lat, lon }, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (bestD < 3) return best.name;
  if (bestD < 40) return `${Math.round(bestD)} km from ${best.name}`;
  return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

export function useGeolocation() {
  const setLocation = useSettings((s) => s.setLocation);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('This device has no location service.');
      return;
    }
    setStatus('locating');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        setLocation({ lat, lon, accuracy, label: labelFor(lat, lon), source: 'gps', at: new Date().toISOString() });
        setStatus('ok');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Pick a place below, or allow location in your browser settings.'
            : 'Could not get a GPS fix. Try again outside, or pick a place below.',
        );
      },
      // Low accuracy is fine (~km) and much faster / kinder to batteries in the cold.
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  }, [setLocation]);

  // If permission was already granted, refresh silently on launch (no prompt).
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (!cancelled && p.state === 'granted') locate();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locate]);

  return { status, error, locate };
}
