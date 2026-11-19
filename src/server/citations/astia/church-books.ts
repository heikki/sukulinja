// The church books as the app can list them apart from any citation: a
// parish archive's Volumes, and every Volume with something on this
// computer, with what of them is on disk, their downloads and what's
// known of their page numbers.

import type {
  ChurchBookVolume,
  InstalledBook,
  PageNumbering
} from '@/common/types';

import type { Astia, Volume } from './astia';
import type { Downloads } from './downloads';
import type { ScanCache } from './scan-cache';

interface Sources {
  astia: Astia;
  cache: ScanCache;
  downloads: Downloads;
}

type Described = Pick<Volume, 'id' | 'label' | 'kind' | 'years' | 'digitized'>;

// The Volume as Astia describes it, with what of it is on disk and its
// download.
async function bookOf(
  { cache, downloads }: Sources,
  v: Described
): Promise<ChurchBookVolume> {
  return {
    id: v.id,
    label: v.label,
    kind: v.kind,
    years: v.years,
    digitized: v.digitized,
    onDisk: await cache.onDisk(v.id),
    download: downloads.of(v.id)
  };
}

// The parish archive's Volumes in Astia's order.
export async function parishBooks(
  sources: Sources,
  archiveId: string
): Promise<ChurchBookVolume[]> {
  const volumes = await sources.astia.archiveVolumes(archiveId);
  return await Promise.all(volumes.map(async (v) => await bookOf(sources, v)));
}

// Every Volume with something on this computer: Images in the Scan cache,
// or a download this run. Those in the install's parishes come first, in
// their order and Astia's, named as Astia lists them; any other, by its id
// alone. A parish Astia can't be asked about names none of its Volumes.
export async function installBooks(
  sources: Sources,
  {
    parishes,
    pagesOf
  }: {
    parishes: string[];
    // What's known of a Volume's page numbers.
    pagesOf: (volumeId: string) => Promise<PageNumbering>;
  }
): Promise<InstalledBook[]> {
  const { astia, cache, downloads } = sources;
  const here = new Set([
    ...(await cache.volumes()),
    ...downloads.list().map((d) => d.volumeId)
  ]);
  const named = await Promise.all(
    parishes.map(async (archiveId) => {
      const volumes = await astia.archiveVolumes(archiveId).catch(() => []);
      const kept = volumes.filter((v) => here.has(v.id));
      if (kept.length === 0) return [];
      const archive = (await astia.archiveTitle(archiveId)) ?? archiveId;
      return kept.map((v) => ({ v, archiveId, archive }));
    })
  );
  const seen = new Set<string>();
  const books = named.flat().filter(({ v }) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
  const unnamed = [...here].filter((id) => !seen.has(id)).toSorted();
  return await Promise.all([
    ...books.map(async ({ v, archiveId, archive }) => ({
      ...(await bookOf(sources, v)),
      archiveId,
      archive,
      pages: await pagesOf(v.id)
    })),
    ...unnamed.map(async (id) => ({
      ...(await bookOf(sources, {
        id,
        label: id,
        kind: null,
        years: null,
        digitized: true
      })),
      archiveId: null,
      archive: null,
      pages: await pagesOf(id)
    }))
  ]);
}
