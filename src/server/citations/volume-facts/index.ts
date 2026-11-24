// A Volume's facts, kept for every dataset of a data folder: its Page pins,
// its page numbers' mark, and the Record ranges MyHeritage's references
// give its film (types.ts). Kept in the data folder (store.ts, files.ts)
// and, while one is set, in the Offload folder beside its Images
// (archive.ts).
//
// Its page numbers are counted from its Page pins (common/page-numbering).
// Marked checked, or as none, they're locked: nothing changes them until
// unmarked. Every change to them is refused on a filming Astia has
// replaced, then while they're locked.

import { bookKind } from '@/common/books';
import { pageNumbering } from '@/common/page-numbering';
import type { ImagePages, PageMark, PageNumbering } from '@/common/types';

import type { Astia } from '../astia/astia';
import { OLD_FILMING, onOldFilming } from '../images';
import type { FolderFacts } from '../storage';
import { describeVolume, factsArchive } from './archive';
import type { LocalPins } from './files';
import { filmingOf, splitVolume } from './filming';
import type { Filming } from './filming';
import { openStore } from './store';

export { fileOf, filmingOf, leavesOut, split, splitVolume } from './filming';
export { isHand } from './types';
export type { Filming } from './filming';
export type { LocalPins } from './files';
export type {
  PagePin,
  Pins,
  RecordPin,
  RecordRange,
  ReferencePin,
  VolumePins
} from './types';

const LOCKED: Record<PageMark, string> = {
  checked:
    'The page numbers of this Volume are marked checked. Unmark them to change them.',
  none: 'This Volume is marked as having no page numbers. Unmark it to change them.'
};

// What's known of the Volume's page numbers, by its mark, else by whether
// any of its pages are read or set.
function numberingOf(volume: LocalPins['volumes'][string] | undefined) {
  if (volume?.mark !== undefined) return volume.mark;
  const read = (volume?.pages.length ?? 0) > 0;
  return read ? ('read' as const) : ('counted' as const);
}

interface Options {
  astia: Astia;
  // The Offload folder's copies of each Volume's facts; none, and they're
  // kept in the data folder only.
  offload?: FolderFacts;
  // The archives the install's parishes are in, to say which holds a
  // Volume in its copy.
  parishes?: () => string[];
}

// The Volume facts of the data folder `folder`, saved with file ids from
// `astia`'s lists, and copied into the Offload folder as each is saved.
export function openVolumeFacts(folder: string, options: Options) {
  const { astia, offload, parishes = () => [] } = options;
  const store = openStore(folder, {
    astia,
    saved: (local) => {
      void archive?.keep(local).catch(() => undefined);
    }
  });
  const archive =
    offload === undefined
      ? null
      : factsArchive(offload, {
          volumeFacts: async () => await store.kept(),
          adoptVolumeFacts: async (volumes) => {
            await store.adopt(volumes);
          },
          about: async (volumeId) =>
            await describeVolume(astia, parishes, volumeId)
        });

  async function kept(volumeId: string) {
    return (await store.volumes())[volumeId];
  }

  // Why the Volume's page numbers can't be changed now, if they can't.
  async function refusal(volumeId: string) {
    if (await onOldFilming(astia, volumeId)) return OLD_FILMING;
    const mark = (await kept(volumeId))?.mark;
    return mark === undefined ? null : LOCKED[mark];
  }

  // A change to the Volume's page numbers on the filming Astia lists now,
  // unless it's refused: why it is, or what the change gives.
  async function changing<T>(
    volumeId: string,
    change: (filming: Filming) => Promise<T>
  ): Promise<{ rejected: string } | { done: T }> {
    const refused = await refusal(volumeId);
    if (refused !== null) return { rejected: refused };
    return { done: await change(await filmingOf(astia, volumeId)) };
  }

  return {
    ...store,

    // The Offload folder's later copies taken in, then every Volume's
    // written out: at start, and when the folder is set.
    syncFolder: async () => {
      await archive?.sync();
    },

    // What's known of the Volume's page numbers.
    numbering: async (volumeId: string): Promise<PageNumbering> =>
      numberingOf(await kept(volumeId)),

    // The pages its Page pins put on each of the Volume's Images, as its
    // estimates count them; without pins, as its books are numbered; none
    // where it's marked as having none. Of the Volume `label` by its label.
    async pagesOn(volumeId: string, label: string): Promise<ImagePages[]> {
      const filming = await filmingOf(astia, volumeId);
      const volumes = await store.volumes();
      if (volumes[volumeId]?.mark === 'none') {
        return filming.files.map((_, i) => ({
          image: i + 1,
          pages: [],
          by: null
        }));
      }
      const own = splitVolume(filming, { volumes, references: {} }).current;
      return pageNumbering(
        own.pages,
        filming.files.length,
        bookKind(label)
      ).pages();
    },

    // Marks the Volume's page numbers checked, or as none, locking them,
    // or with null no longer.
    mark: async (volumeId: string, as: PageMark | null) => {
      await store.markPages(volumeId, as);
    },

    // Reads how the Volume, `volume` by its label, numbers its pages with
    // `survey` (ADR-0032), told how many Images it has, and saves what it
    // read as Page pins, `replace`-ing the Volume's vision ones: the
    // survey with how many it pinned, or why it can't be made.
    async survey<
      S extends { readings: Array<{ image: number; pages: number[] }> }
    >(
      volumeId: string,
      volume: string,
      survey: (images: number) => Promise<S>,
      { replace = false }: { replace?: boolean } = {}
    ): Promise<{ rejected: string } | (S & { pinned: number })> {
      const made = await changing(volumeId, async (filming) => {
        if (filming.files.length === 0) return null;
        const surveyed = await survey(filming.files.length);
        await store.savePageReadings(filming, volume, surveyed.readings, {
          replace
        });
        return { ...surveyed, pinned: surveyed.readings.length };
      });
      if ('rejected' in made) return made;
      return made.done ?? { rejected: 'The volume has no images.' };
    },

    // Sets the Image's pages by hand, or with null takes the pinned ones
    // away (ADR-0032): why it can't be, or nothing.
    async setImagePage(
      at: { volumeId: string; volume: string; image: number },
      pages: number[] | null
    ): Promise<{ rejected: string } | null> {
      const { volumeId, volume, image } = at;
      const set = await changing(volumeId, async (filming) => {
        if (image < 1 || image > filming.files.length) return false;
        await store.setImagePage(filming, volume, image, pages);
        return true;
      });
      if ('rejected' in set) return set;
      return set.done ? null : { rejected: 'The volume has no such image.' };
    },

    // Takes the Volume's Page pins away (ADR-0032): why it can't be, or
    // nothing.
    async clearPages(volumeId: string): Promise<{ rejected: string } | null> {
      const cleared = await changing(volumeId, async (filming) => {
        await store.clearPages(filming);
      });
      return 'rejected' in cleared ? cleared : null;
    }
  };
}

export type VolumeFacts = ReturnType<typeof openVolumeFacts>;
