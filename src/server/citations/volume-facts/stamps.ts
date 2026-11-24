import type { VolumePins } from './types';

// Whether two of a Volume's facts say the same, whenever saved.
export function sameFacts(a: VolumePins, b: VolumePins | undefined) {
  if (b === undefined) return false;
  const { saved: _a, ...one } = a;
  const { saved: _b, ...other } = b;
  return JSON.stringify(one) === JSON.stringify(other);
}

// Whether `a` was saved after `b`; one never stamped is the earliest.
export function isLater(a: VolumePins, b: VolumePins | undefined) {
  return b === undefined || (a.saved ?? '') > (b.saved ?? '');
}
