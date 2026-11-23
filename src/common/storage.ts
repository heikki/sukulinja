// What both sides read alike of what Storage has of a Volume.

import type { VolumeOnDisk } from './types';

// Whether every Image of Astia's list of the Volume is here, on disk or in
// the Offload folder: none to download.
export function isWhole(d: VolumeOnDisk) {
  return d.images !== null && d.images > 0 && d.cached === d.images;
}
