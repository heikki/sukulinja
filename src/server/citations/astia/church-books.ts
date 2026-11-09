// The church books as the app can list them apart from any citation: the
// known parishes, and each one's Volumes with what of them is on disk and
// their downloads.

import type { ChurchBookParish, ChurchBookVolume } from '@/common/types';

import { PARISHES } from './archives';
import type { Astia } from './astia';
import type { Downloads } from './downloads';
import type { ScanCache } from './scan-cache';

interface Sources {
  astia: Astia;
  cache: ScanCache;
  downloads: Downloads;
}

export function parishes(): ChurchBookParish[] {
  return PARISHES.map(({ name, archiveId }) => ({ name, archiveId })).sort(
    (a, b) => a.name.localeCompare(b.name, 'fi')
  );
}

// The parish archive's Volumes in Astia's order; null for an archive that
// isn't a known parish's.
export async function parishBooks(
  { astia, cache, downloads }: Sources,
  archiveId: string
): Promise<ChurchBookVolume[] | null> {
  if (!PARISHES.some((p) => p.archiveId === archiveId)) return null;
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
