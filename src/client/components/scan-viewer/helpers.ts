import type { ScanMethod } from '@common/types';

// How the reference's link to an Image was found, said of the link.
export const LINK_LABELS: Record<ScanMethod, string> = {
  placed: 'Placed link',
  anchored: 'Anchored link',
  estimated: 'Estimated link',
  volume: 'Volume only'
};

// Image numbers run 1..count; before the count is known, only from 1.
export function clampImage(n: number, count: number | null) {
  const high = count ?? Infinity;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, high));
}

// Served by the app, which caches it; `retry` makes a failed load ask again.
export function imageUrl(volumeId: string, n: number, retry: number) {
  const url = `/astia/volumes/${volumeId}/images/${n}`;
  return retry === 0 ? url : `${url}?retry=${retry}`;
}
