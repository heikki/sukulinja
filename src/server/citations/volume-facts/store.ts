// The Volume facts as kept in the data folder's pins.local.json, read and
// saved for every dataset. A newer Page pin replaces any on the same Image
// or claiming one of its pages, so re-marking a page moves it, and a hand
// one always wins over the vision model's. A pin on an Image keeps the
// Image's Astia file id, from the Volume's list when saved; one made on
// another filming of the Volume (filming.ts) is left out of the clashes a
// save weighs, so it never keeps a pin for the filming now from being
// saved. How the file is kept on disk, and saved from more than one
// process at once, is files.ts.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  pageClash,
  pageNumbering,
  runOf,
  splitSkips
} from '@/common/page-numbering';
import type { SkippedRun } from '@/common/page-numbering';
import type { BookKind, PageMark } from '@/common/types';

import type { Astia } from '../astia/astia';
import {
  fileStamp,
  fillFileIds,
  migrate,
  readLocalFile,
  withLock,
  writeLocalFile
} from './files';
import type { LocalPins } from './files';
import { fileOf, filmingOf, split } from './filming';
import type { Filming } from './filming';
import { isLater, sameFacts } from './stamps';
import { isHand } from './types';
import type { PagePin, Pins } from './types';

// Whether `entry` may replace the entries it clashes with.
function overrides(entry: { by?: string }, clashing: Array<{ by?: string }>) {
  return isHand(entry) || !clashing.some(isHand);
}

function byImage(a: PagePin, b: PagePin) {
  return a.image - b.image;
}

type Clash = (pin: PagePin) => (p: PagePin) => boolean;

// Only a pin on the same Image: a page set there by hand, where a book may
// have a page twice, filmed twice or numbered so.
function sameImage(pin: PagePin) {
  return (p: PagePin) => p.image === pin.image;
}

// The list with the Page pin in, unless a pin it clashes with wins. Saving
// into the Volume of `filming`, its stale pins aren't weighed.
function withPagePin(
  pins: PagePin[],
  pin: PagePin,
  filming: Filming,
  clash: Clash
) {
  const clashes = clash(pin);
  const weighed = split(filming, pins).current;
  if (!overrides(pin, weighed.filter(clashes))) return pins;
  return [...pins.filter((p) => !clashes(p)), pin].sort(byImage);
}

// The Volumes as the local file keeps them, without the Record pins left
// there, which no dataset cites.
function readVolumes(local: LocalPins) {
  return Object.fromEntries(
    Object.entries(local.volumes).map(([id, volume]) => {
      const { records: _left, ...rest } = volume;
      return [id, rest];
    })
  );
}

// One save's view of the local file, read under the lock, and the filming of the Volume it saves into, as Astia lists
// it now.
interface Draft {
  local: LocalPins;
  filming: Filming;
}

function mergedVolumes(draft: Draft) {
  return readVolumes(draft.local);
}

function addPagePin(
  draft: Draft,
  title: string,
  pin: PagePin,
  clash: Clash = pageClash
) {
  const { filming } = draft;
  const { volumeId } = filming;
  const known = mergedVolumes(draft)[volumeId]?.pages ?? [];
  const weighed = split(filming, known).current;
  if (!overrides(pin, weighed.filter(clash(pin)))) return;
  const ends = splitEnds(weighed, pin);
  if (ends === null) return;
  const { volumes } = draft.local;
  const volume = volumes[volumeId];
  const pages = ends.reduce(
    (kept, image) =>
      withPagePin(kept, endOf(filming, pin, image), filming, sameImage),
    withPagePin(volume?.pages ?? [], pin, filming, clash)
  );
  volumes[volumeId] = {
    ...volume,
    title: volume?.title ?? title,
    pages
  };
}

// A skip on the Image, where the page `pin` sets splits a run.
function endOf(filming: Filming, pin: PagePin, image: number): PagePin {
  return {
    image,
    pages: [],
    note: pin.note ?? 'set in the Scan viewer',
    by: pin.by ?? 'hand',
    ...fileOf(filming, image)
  };
}

// A page in a run of skipped Images splits it, the rest either side still
// skipped: the Images either side it then skips, or null where the page
// isn't saved, as a skip set there by hand wins over the vision model's
// page.
function splitEnds(weighed: PagePin[], pin: PagePin) {
  const run = pin.pages.length === 0 ? null : runOf(weighed, pin.image);
  if (run === null) return [];
  if (!isHand(pin) && skippedByHand(weighed, run)) return null;
  return splitSkips(weighed, pin.image);
}

// Whether the run's skips were set by hand.
function skippedByHand(pins: PagePin[], run: SkippedRun) {
  return pins.some(
    (p) =>
      p.pages.length === 0 &&
      p.image >= run.from &&
      p.image <= run.to &&
      isHand(p)
  );
}

// A cited page, in a book of the kind.
interface Cited {
  page: number;
  kind: BookKind | null;
}

// A volume numbered by page carries two numbers per image; the new Page pin
// follows the ones already in that volume, or how it's counted.
function pagesFor(draft: Draft, { page, kind }: Cited) {
  const { filming } = draft;
  const known = mergedVolumes(draft)[filming.volumeId]?.pages ?? [];
  const { current } = split(filming, known);
  return pageNumbering(current, filming.files.length, kind).pinPages(page);
}

// The pages a Page pin for the cited page gives on `image`.
function pagePin(
  draft: Draft,
  cited: Cited,
  image: number,
  by: 'hand' | 'vision'
): PagePin {
  return {
    image,
    pages: pagesFor(draft, cited),
    note: by === 'hand' ? 'marked in the app' : 'read by the vision model',
    by,
    ...fileOf(draft.filming, image)
  };
}

// The Page pins and Record ranges of a data folder, shared by its datasets,
// saved with file ids from `astia`'s lists.
// `saved` hears of each write, the Volumes as then saved.
export function openStore(
  folder: string,
  options: { astia: Astia; saved?: (local: LocalPins) => void }
) {
  const { astia } = options;
  const localFile = join(folder, 'pins.local.json');
  const lockFile = join(folder, 'pins.lock');
  let migration: Promise<void> | null = null;
  let merged: { stamp: string; volumes: Promise<Pins['volumes']> } | null =
    null;

  // Once a run, before the pins are first read: a folder saved before pins
  // has its files migrated, and pins saved before pins kept file ids get
  // them. Filling them is upkeep: one that fails is logged, and the pins
  // read as they are.
  async function migrated() {
    migration ??= (async () => {
      if (!(await Bun.file(localFile).exists())) {
        await mkdir(folder, { recursive: true });
        await withLock(lockFile, async () => {
          await migrate(folder, localFile);
        });
      }
      await fillFileIds(folder, astia).catch((err: unknown) => {
        console.error('Filling in pins’ file ids failed:', err);
      });
    })();
    await migration;
  }

  async function readLocal() {
    await migrated();
    return await readLocalFile(localFile);
  }

  async function stamp() {
    return await fileStamp(localFile);
  }

  // Each Volume changed by the write stamped with when, unless it came
  // with a stamp of its own.
  async function write(local: LocalPins) {
    const before = (await readLocalFile(localFile)).volumes;
    const now = new Date().toISOString();
    for (const [id, volume] of Object.entries(local.volumes)) {
      const was = before[id];
      if (volume.saved === was?.saved && !sameFacts(volume, was)) {
        volume.saved = now;
      }
    }
    await writeLocalFile(localFile, local);
    options.saved?.(local);
  }

  // One write of the local file, as `edit` changes it.
  async function saving(edit: (local: LocalPins) => void) {
    await migrated();
    await mkdir(folder, { recursive: true });
    await withLock(lockFile, async () => {
      const local = await readLocal();
      edit(local);
      await write(local);
    });
    merged = null;
  }

  return {
    astia,

    // The local file's Volumes. Kept while the file is unchanged.
    async volumes() {
      const now = await stamp();
      if (merged?.stamp !== now) {
        merged = {
          stamp: now,
          volumes: readLocal().then(readVolumes)
        };
      }
      return await merged.volumes;
    },

    // Changes whenever the local file does, from this process or another.
    stamp,

    // The Volume's filming a save on an Image is made on.
    filmingOf: async (volumeId: string) => await filmingOf(astia, volumeId),

    // A Page pin for a reference's cited page on the Image, by hand or the
    // model's, unless a hand one there wins. One write.
    async savePagePin(
      filming: Filming,
      cited: Cited,
      at: { volume: string; image: number; by: 'hand' | 'vision' }
    ) {
      await saving((local) => {
        const draft = { local, filming };
        addPagePin(draft, at.volume, pagePin(draft, cited, at.image, at.by));
      });
    },

    // Page pins for the Page numbers the vision model read on the
    // Volume's Images, each unless a hand one there wins; `replace` takes
    // the Volume's Page pins away first, hand ones too (Heikki, 2026-11-16:
    // the Scan viewer warns of them). One write.
    async savePageReadings(
      filming: Filming,
      volume: string,
      readings: Array<{ image: number; pages: number[] }>,
      { replace = false } = {}
    ) {
      await migrated();
      await mkdir(folder, { recursive: true });
      await withLock(lockFile, async () => {
        const draft = { local: await readLocal(), filming };
        const kept = draft.local.volumes[filming.volumeId];
        if (replace && kept !== undefined) {
          const { current } = split(filming, kept.pages);
          kept.pages = kept.pages.filter((p) => !current.includes(p));
        }
        for (const { image, pages } of readings) {
          addPagePin(draft, volume, {
            image,
            pages,
            note: 'read by the vision model',
            by: 'vision',
            ...fileOf(filming, image)
          });
        }
        await write(draft.local);
      });
      merged = null;
    },

    // A hand Page pin of `pages` on the Image, as the Scan viewer sets it:
    // a spread's two, or one, as typed; none skips the Image, and with a
    // skip before or after it, if no pin is between, the Images between;
    // null takes the Page pins there away, hand or the vision model's, so
    // the Image is counted again. One write.
    async setImagePage(
      filming: Filming,
      volume: string,
      image: number,
      pages: number[] | null
    ) {
      await migrated();
      await mkdir(folder, { recursive: true });
      await withLock(lockFile, async () => {
        const draft = { local: await readLocal(), filming };
        const kept = draft.local.volumes[filming.volumeId];
        const current = split(filming, kept?.pages ?? []).current;
        if (pages === null) {
          if (kept === undefined) return;
          kept.pages = kept.pages.filter(
            (p) => !(p.image === image && current.includes(p))
          );
        } else {
          addPagePin(
            draft,
            volume,
            {
              image,
              pages,
              note: 'set in the Scan viewer',
              by: 'hand',
              ...fileOf(filming, image)
            },
            sameImage
          );
        }
        await write(draft.local);
      });
      merged = null;
    },

    // Takes every Page pin of the Volume's filming away, hand or the
    // vision model's: its pages counted anew as its book is numbered.
    async clearPages(filming: Filming) {
      await saving((local) => {
        const kept = local.volumes[filming.volumeId];
        if (kept === undefined) return;
        const { current } = split(filming, kept.pages);
        kept.pages = kept.pages.filter((p) => !current.includes(p));
      });
    },

    // The Volume's page numbers marked checked, or as none, or with null
    // no longer: one mark at a time. One write.
    async markPages(volumeId: string, as: PageMark | null) {
      await saving((local) => {
        const { volumes } = local;
        const { mark: _, ...kept } = volumes[volumeId] ?? { pages: [] };
        volumes[volumeId] = as === null ? kept : { ...kept, mark: as };
      });
    },

    // The pins as the local file keeps them.
    async kept() {
      return await readLocal();
    },

    // Volumes kept elsewhere, the offload folder say, each taken whole in
    // place of the local file's where it's later, or the file has none.
    async adopt(volumes: Pins['volumes']) {
      const have = (await readLocal()).volumes;
      if (!Object.entries(volumes).some(([id, v]) => isLater(v, have[id]))) {
        return;
      }
      await saving((local) => {
        const { volumes: kept } = local;
        for (const [id, v] of Object.entries(volumes)) {
          if (isLater(v, kept[id])) kept[id] = v;
        }
      });
    }
  };
}

export type Store = ReturnType<typeof openStore>;
