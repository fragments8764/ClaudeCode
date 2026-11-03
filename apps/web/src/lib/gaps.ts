import { findCloudGaps, type Gap } from '@nordurljos/core';
import { useMemo } from 'react';
import { useCloudGrid, useSpots } from './api';
import { hhmm } from './format';
import { useSettings } from './store';

/** Cloud-gap hunter using the Iceland cloud grid + curated spots, respecting your preferences. */
export function useCloudGaps(now: Date): { gaps: Gap[]; loading: boolean } {
  const { location, maxDriveMin, minDarkness } = useSettings();
  const grid = useCloudGrid();
  const spots = useSpots();
  const g = grid.data?.data;
  const list = spots.data?.data;
  const minute = Math.floor(now.getTime() / 300_000); // recompute every 5 min
  const gaps = useMemo(() => {
    if (!g || !list) return [];
    return findCloudGaps({ from: location, now, grid: g, spots: list, maxDriveMin, minDark: minDarkness === 'astronomical' ? 0.95 : 0.6, fmt: hhmm }).slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, list, location.lat, location.lon, maxDriveMin, minDarkness, minute]);
  return { gaps, loading: grid.isLoading || spots.isLoading };
}
