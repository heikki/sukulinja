// The church books as the app can list them apart from any citation: a
// parish archive's Volumes with what of them is on disk and their
// downloads.

import type { ChurchBookVolume } from '@/common/types';

import type { Astia } from './astia';
import type { Downloads } from './downloads';
import type { ScanCache } from './scan-cache';

interface Sources {
  astia: Astia;
  cache: ScanCache;
  downloads: Downloads;
}

// The parish archive's Volumes in Astia's order.
export async function parishBooks(
  { astia, cache, downloads }: Sources,
  archiveId: string
): Promise<ChurchBookVolume[]> {
  const volumes = await astia.archiveVolumes(archiveId);
  return await Promise.all(
    volumes.map(async (v) => ({
      id: v.id,
      label: v.label,
      digitized: v.digitized,
      onDisk: await cache.onDisk(v.id),
      download: downloads.of(v.id)
    }))
  );
}
