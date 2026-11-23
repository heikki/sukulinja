// A Volume's facts, its page numbers and their marks, kept in the offload
// folder beside its Images too, so the folder holds each Volume whole:
// written there as they change, and at a sync each Volume's later copy
// kept whole, the folder's taken in place of the local file's when it's
// later (another computer's, say). Never merged. Each copy is stamped, and
// says which archive holds the Volume, where it is in Astia and which
// Image each file is, for anyone reading the folder: what's read back
// leaves those out.

import { archiveAmong } from './astia/archives';
import { viewerUrl } from './astia/astia';
import type { Astia } from './astia/astia';
import { isLater, sameFacts } from './myheritage';
import type { Pins } from './myheritage';
import type { FolderFacts } from './storage';

type Volume = Pins['volumes'][string];

// What a copy says of its Volume for whoever reads it.
interface About {
  archive?: string;
  astia?: string;
  // Its Images' Astia file ids, in order: the names of its Images in the
  // folder, image 1 first.
  images?: string[];
}

interface Facts {
  volumeFacts: () => Promise<Pins>;
  adoptVolumeFacts: (volumes: Pins['volumes']) => Promise<void>;
  // What's known of the Volume to say in its copy; none, nothing.
  about?: (volumeId: string) => Promise<About>;
}

// A copy read back: its facts, and what it says of its Volume.
interface Archived {
  facts?: Volume;
  about: About;
}

function parsed(text: string | null): Archived {
  if (text === null) return { about: {} };
  try {
    const { archive, astia, images, ...facts } = JSON.parse(text) as Volume &
      About;
    return {
      facts,
      about: {
        ...(archive === undefined ? {} : { archive }),
        ...(astia === undefined ? {} : { astia }),
        ...(images === undefined ? {} : { images })
      }
    };
  } catch {
    // One cut off or edited by hand is written over.
    return { about: {} };
  }
}

// The archive holding the Volume among the install's parishes, its first
// Image in Astia's viewer, and its Images' file ids, as far as they're
// known; an archive
// already crawled, and a list of Images kept, cost no request.
export async function describeVolume(
  astia: Astia,
  parishes: () => string[],
  volumeId: string
): Promise<About> {
  const [archiveId, files] = await Promise.all([
    archiveAmong(astia, volumeId, parishes()).catch(() => null),
    astia.cachedImages(volumeId)
  ]);
  const archive =
    archiveId === null
      ? null
      : await astia.archiveTitle(archiveId).catch(() => null);
  const first = files?.[0];
  return {
    ...(archive === null ? {} : { archive }),
    ...(first === undefined
      ? {}
      : { astia: viewerUrl(volumeId, first), images: files! })
  };
}

export function factsArchive(folder: FolderFacts, facts: Facts) {
  // Those whose copy was told about them this run: one that can't be is
  // asked about once.
  const told = new Set<string>();

  // Its copy as written: the Volume's facts, stamped, after what's said
  // of it.
  function copyOf(volume: Volume, about: About) {
    const { images, ...said } = about;
    return JSON.stringify(
      {
        title: volume.title,
        ...said,
        ...volume,
        // One never changed here is stamped as it's written.
        saved: volume.saved ?? new Date().toISOString(),
        images
      },
      null,
      2
    );
  }

  // Whether the folder's copy is to be written over: not when it's later,
  // nor when it's the same and says all it can.
  function stale(id: string, volume: Volume, archived: Archived) {
    const { facts: was, about } = archived;
    if (was !== undefined && isLater(was, volume)) return false;
    if (!sameFacts(volume, was) || was?.saved !== volume.saved) return true;
    const whole = about.archive !== undefined && about.images !== undefined;
    return !whole && !told.has(id) && facts.about !== undefined;
  }

  // Each Volume's facts into the folder, unless it has them, or later.
  async function keep(local: Pins) {
    await Promise.all(
      Object.entries(local.volumes).map(async ([id, volume]) => {
        const archived = parsed(await folder.facts(id));
        if (!stale(id, volume, archived)) return;
        told.add(id);
        const about = {
          ...archived.about,
          ...(await facts.about?.(id).catch(() => ({})))
        };
        await folder.keepFacts(id, copyOf(volume, about));
      })
    );
  }

  // One keep after another, so a later save's copy is never written over
  // by an earlier one's.
  let last: Promise<void> = Promise.resolve();
  function queued(local: Pins) {
    last = last
      .catch(() => undefined)
      .then(async () => {
        await keep(local);
      });
    return last;
  }

  return {
    keep: queued,

    // The folder's later copies taken in, then every Volume's written out.
    async sync() {
      const local = await facts.volumeFacts();
      const later: Pins['volumes'] = {};
      for (const id of await folder.volumes()) {
        // eslint-disable-next-line no-await-in-loop -- one small file at a time
        const archived = parsed(await folder.facts(id)).facts;
        if (archived !== undefined && isLater(archived, local.volumes[id])) {
          later[id] = archived;
        }
      }
      await facts.adoptVolumeFacts(later);
      await queued(await facts.volumeFacts());
    }
  };
}
