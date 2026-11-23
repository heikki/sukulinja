// The church books as the app can list them apart from any citation: a
// parish archive's Volumes, and every Volume with something on this
// computer, with what Storage has of them.

import type { ChurchBookVolume } from '@/common/types';

import type { StorageVolumes, Stored } from '../storage';
import type { Astia, Volume } from './astia';

interface Sources {
  astia: Astia;
  storage: Pick<StorageVolumes, 'of' | 'here'>;
}

type Described = Pick<Volume, 'id' | 'label' | 'kind' | 'years' | 'digitized'>;

// A Volume with something on this computer, with the archive holding it,
// by its id and title, when one of the install's parishes has it, null
// when none does.
export type HereBook = ChurchBookVolume & {
  archiveId: string | null;
  archive: string | null;
};

// The Volume as Astia describes it, with what of it is on disk, its
// download, and what Storage would do next with it.
function bookOf(
  v: Described,
  { onDisk, download, offloaded, next }: Stored
): ChurchBookVolume {
  return {
    id: v.id,
    label: v.label,
    kind: v.kind,
    years: v.years,
    digitized: v.digitized,
    onDisk,
    download,
    offloaded,
    next
  };
}

// The parish archive's Volumes in Astia's order.
export async function parishBooks(
  sources: Sources,
  archiveId: string
): Promise<ChurchBookVolume[]> {
  const volumes = await sources.astia.archiveVolumes(archiveId);
  return await Promise.all(
    volumes.map(async (v) =>
      bookOf(v, await sources.storage.of(v.id, v.digitized))
    )
  );
}

// Every Volume with something on this computer: Images in Storage, or a
// download this run. Those in the install's parishes come first, in
// their order and Astia's, named as Astia lists them; any other, by its id
// alone. A parish Astia can't be asked about names none of its Volumes.
export async function installBooks(
  sources: Sources,
  parishes: string[]
): Promise<HereBook[]> {
  const { astia, storage } = sources;
  async function installed(v: Described) {
    return bookOf(v, await storage.of(v.id, v.digitized));
  }
  const here = new Set(await storage.here());
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
      ...(await installed(v)),
      archiveId,
      archive
    })),
    ...unnamed.map(async (id) => ({
      ...(await installed({
        id,
        label: id,
        kind: null,
        years: null,
        digitized: true
      })),
      archiveId: null,
      archive: null
    }))
  ]);
}
