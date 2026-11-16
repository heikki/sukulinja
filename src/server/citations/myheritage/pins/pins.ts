// What resolution reads (see locate.ts), and the saving of it.
//
// Facts about Volumes are shared by every dataset: the Page pins and
// Record ranges in the data folder's pins.local.json, where a Mark or the
// vision pass saves a Page pin. Nothing is shipped with the app: an
// estimate starts from the reference alone, and what the person Marks or
// the vision model reads is all it learns from. A newer Page pin replaces
// any on the same image or claiming one of its pages, so re-marking a page
// moves it.
//
// A dataset's Marks and Matches are in its citations (marks.ts,
// ADR-0013). Resolution reads each as a Reference pin of every reference
// citing its record, and, on an Image, as a Record pin, which extends its
// Volume's Record range for that dataset only.
//
// A Mark always wins: a Match never replaces one, and a Mark replaces a
// Match. A Discard takes a Box
// back; a Match taken back is only undone, and nothing of it is kept.
//
// A pin on an Image keeps the Image's Astia file id, from the Volume's
// list when saved. One made on another filming of the Volume
// (filming.ts) is left out of the clashes a save weighs, so it never keeps
// a pin for the filming now from being saved.
//
// How the local file is kept on disk, and saved from two processes at
// once, is files.ts.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Box } from '@/common/types';

import type { CitationLink } from '../../annotations';
import type { Astia } from '../../astia/astia';
import type {
  BoxAt,
  DiscardDone,
  MarkDone,
  MarkTarget
} from '../../references';
import { markKey } from '../record';
import type { ChurchBookRef } from '../record';
import {
  fileStamp,
  fillFileIds,
  migrate,
  readLocalFile,
  withLock,
  writeLocalFile
} from './files';
import type { LocalPins } from './files';
import { filmingOf, leavesOut, split } from './filming';
import type { Filming } from './filming';
import type {
  PagePin,
  Pins,
  RecordPin,
  RecordRange,
  ReferencePin,
  VolumePins
} from './locate';
import type { Marks } from './marks';
import { pageClash } from './runs';

// ---------------------------------------------------------------- merging

interface Saved {
  by?: string;
}

function isHand(entry: Saved) {
  return entry.by !== 'vision';
}

// Whether `entry` may replace the entries it clashes with.
function overrides(entry: Saved, clashing: Saved[]) {
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

function covers(range: RecordRange, record: number) {
  return range.from <= record && record <= range.to;
}

function contains(outer: RecordRange, inner: RecordRange) {
  return outer.from <= inner.from && inner.to <= outer.to;
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

// The Record range a Record pin extends its volume's to, or null: none
// when a range of the volume already holds it, or when the extension would
// reach into another volume's range. A volume with no range starts one.
// Each volume's records form one unbroken block on its film, so the records
// numbered in between are on the volume too.
function extendedRange(
  volumes: Pins['volumes'],
  volumeId: string,
  record: number
) {
  const own = volumes[volumeId]?.ranges ?? [];
  if (own.some((r) => covers(r, record))) return null;
  function distance(r: RecordRange) {
    return record < r.from ? r.from - record : record - r.to;
  }
  const nearest = own.toSorted((a, b) => distance(a) - distance(b))[0];
  const range =
    nearest === undefined
      ? { from: record, to: record }
      : {
          from: Math.min(nearest.from, record),
          to: Math.max(nearest.to, record)
        };
  const others = Object.entries(volumes)
    .filter(([id]) => id !== volumeId)
    .flatMap(([, v]) => v.ranges ?? []);
  const blocked = others.some((r) => r.from <= range.to && range.from <= r.to);
  return blocked ? null : range;
}

// ---------------------------------------------------------------- marks as pins

function pinFields(link: CitationLink) {
  const { image, box, fileId, by } = link;
  return {
    ...(image === undefined ? {} : { image }),
    by,
    ...(box === undefined ? {} : { box }),
    ...(fileId === undefined ? {} : { fileId })
  };
}

function referencePinOf(link: CitationLink): ReferencePin {
  return { volumeId: link.volumeId, volume: link.volume, ...pinFields(link) };
}

// The Record pins the Marks on Images give, by Volume: one per record.
function recordPinsOf(marked: ReturnType<Marks['linked']>) {
  const seen = new Set<number>();
  const out: Array<{ volumeId: string; title: string; pin: RecordPin }> = [];
  for (const { recordId, link } of marked) {
    if (recordId === null || link.image === undefined || seen.has(recordId)) {
      continue;
    }
    seen.add(recordId);
    const { image, ...rest } = pinFields(link);
    out.push({
      volumeId: link.volumeId,
      title: link.volume,
      pin: { record: recordId, image: image!, ...rest }
    });
  }
  return out;
}

// The Volumes' facts with the Marks read over them: each Mark on an Image a
// Record pin extending its Volume's Record range, and every marked
// citation's reference a Reference pin.
function withMarks(volumes: Pins['volumes'], marks: Marks): Pins {
  const marked = marks.linked();
  const out = { ...volumes };
  for (const { volumeId, title, pin } of recordPinsOf(marked)) {
    const volume: VolumePins = { ...(out[volumeId] ?? { title, pages: [] }) };
    volume.records = [...(volume.records ?? []), pin];
    out[volumeId] = volume;
    const range = extendedRange(out, volumeId, pin.record);
    if (range !== null) {
      volume.ranges = [
        ...(volume.ranges ?? []).filter((r) => !contains(range, r)),
        range
      ];
    }
  }
  const references: Pins['references'] = {};
  for (const { url, link } of marked) {
    references[url] ??= referencePinOf(link);
  }
  return { volumes: out, references };
}

// ---------------------------------------------------------------- saving Page pins

// One save's view of the local file, read under the lock, and the filming of the Volume it saves into, as Astia lists
// it now.
interface Draft {
  local: LocalPins;
  filming: Filming;
}

function fileOf(filming: Filming, image: number) {
  const fileId = filming.files[image - 1];
  return fileId === undefined ? {} : { fileId };
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
  const { volumes } = draft.local;
  const volume = volumes[volumeId];
  volumes[volumeId] = {
    ...volume,
    title: volume?.title ?? title,
    pages: withPagePin(volume?.pages ?? [], pin, filming, clash)
  };
}

// A volume numbered by page carries two numbers per image; the new Page pin
// follows the ones already in that volume, or the book type.
function pagesFor(draft: Draft, volumeId: string, ref: ChurchBookRef) {
  const page = ref.page!;
  const known = mergedVolumes(draft)[volumeId]?.pages ?? [];
  const twoPages =
    known.length > 0
      ? known.some((a) => a.pages.length === 2)
      : ref.kind === 'lasten';
  return twoPages ? [page, page + 1] : [page];
}

// The pages a Page pin for the reference's cited page gives on `image`.
function pagePin(
  draft: Draft,
  ref: ChurchBookRef,
  image: number,
  by: 'hand' | 'vision'
): PagePin {
  return {
    image,
    pages: pagesFor(draft, draft.filming.volumeId, ref),
    note: by === 'hand' ? 'marked in the app' : 'read by the vision model',
    by,
    ...fileOf(draft.filming, image)
  };
}

// The Page pins and Record ranges of a data folder, shared by its datasets,
// saved with file ids from `astia`'s lists.
export function openVolumeFacts(folder: string, options: { astia: Astia }) {
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

    // A Page pin for the reference's cited page on the Image, by hand or
    // the model's, unless a hand one there wins. One write.
    async savePagePin(
      filming: Filming,
      ref: ChurchBookRef,
      at: { volume: string; image: number; by: 'hand' | 'vision' }
    ) {
      await migrated();
      await mkdir(folder, { recursive: true });
      await withLock(lockFile, async () => {
        const draft = { local: await readLocal(), filming };
        const pin = pagePin(draft, ref, at.image, at.by);
        addPagePin(draft, at.volume, pin);
        await writeLocalFile(localFile, draft.local);
      });
      merged = null;
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
        await writeLocalFile(localFile, draft.local);
      });
      merged = null;
    },

    // A hand Page pin of `pages` on the Image, as the Scan viewer sets it:
    // a spread's two, or one, its right page following where the Volume
    // numbers pages; null takes the Page pins there away, hand or the vision
    // model's, so the Image is counted again. One write.
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
          const twoPages = current.some((p) => p.pages.length === 2);
          const [page] = pages as [number];
          addPagePin(
            draft,
            volume,
            {
              image,
              pages: pages.length === 1 && twoPages ? [page, page + 1] : pages,
              note: 'set in the Scan viewer',
              by: 'hand',
              ...fileOf(filming, image)
            },
            sameImage
          );
        }
        await writeLocalFile(localFile, draft.local);
      });
      merged = null;
    },

    // Takes every Page pin of the Volume's filming away, hand or the
    // vision model's: its pages counted anew as its book is numbered.
    async clearPages(filming: Filming) {
      await migrated();
      await mkdir(folder, { recursive: true });
      await withLock(lockFile, async () => {
        const local = await readLocal();
        const kept = local.volumes[filming.volumeId];
        if (kept === undefined) return;
        const { current } = split(filming, kept.pages);
        kept.pages = kept.pages.filter((p) => !current.includes(p));
        await writeLocalFile(localFile, local);
      });
      merged = null;
    },

    // The pins as the local file keeps them.
    async kept() {
      return await readLocal();
    }
  };
}

type VolumeFacts = ReturnType<typeof openVolumeFacts>;

// ---------------------------------------------------------------- the module

export type { BoxAt, DiscardDone, MarkDone, MarkTarget };

// A Match as saved: its Box in pixels of the full-size Image.
interface PixelMatch {
  volumeId: string;
  volume: string;
  image: number;
  // Whether the model read the cited page on that very Image.
  onCitedPage: boolean;
  box: Box;
}

// The Link's Box, when it's on the Image of the filming now: a Mark there
// keeps it, as confirming a Match does.
function boxThere(
  link: CitationLink | null,
  filming: Filming,
  image: number
): { box?: Box } {
  if (link?.volumeId !== filming.volumeId || link.image !== image) return {};
  if (link.box === undefined || leavesOut(filming, link)) return {};
  return { box: link.box };
}

// A dataset's pins: the data folder's facts about Volumes, and the
// dataset's Marks.
export function openPins(facts: VolumeFacts, marks: Marks) {
  return {
    // What resolution reads: the facts about Volumes with the Marks read
    // over them.
    async snapshot(): Promise<Pins> {
      return withMarks(await facts.volumes(), marks);
    },

    // Changes whenever the local file or the Marks do.
    async stamp() {
      return `${await facts.stamp()}/${marks.stamp()}`;
    },

    // The dataset's Marks as the pins they are kept as: Record pins,
    // Reference pins for references with no Record number. Rejections are
    // no longer kept (ADR-0029).
    marked(): LocalPins {
      const linked = marks.linked();
      const volumes: Pins['volumes'] = {};
      for (const { volumeId, title, pin } of recordPinsOf(linked)) {
        const volume = volumes[volumeId] ?? { title, pages: [] };
        volumes[volumeId] = {
          ...volume,
          records: [...(volume.records ?? []), pin]
        };
      }
      const references = Object.fromEntries(
        linked
          .filter((m) => m.recordId === null)
          .map((m) => [m.url, referencePinOf(m.link)])
      );
      return { volumes, references };
    },

    // A Mark: the reference's record is on the Image, or in the Volume when
    // the target gives none. `volume` is the Volume's label; `linked`,
    // whether the reference links that Volume by the Book it cites.
    //
    // Only a Volume is the record's own Link, and nothing its neighbours
    // count from. On an Image, a cited page found in a Volume the reference
    // already links is also a Page pin, which moves the Volume's other
    // references near it too; a reference with neither a Record number nor
    // a Box then needs no Link of its own. Says what it did.
    async recordMark(
      ref: ChurchBookRef,
      target: MarkTarget,
      where: { volume: string; linked: boolean }
    ): Promise<MarkDone> {
      const key = markKey(ref);
      const { volumeId, image } = target;
      const { volume, linked } = where;
      const before = marks.linkOf(key);
      const citations = marks.countOf(key);
      if (image === undefined) {
        marks.change(() => {
          marks.write(key, { volumeId, volume, by: 'hand' });
        });
        return {
          at: 'volume',
          volume,
          confirmed: false,
          citations,
          pagePin: null
        };
      }
      const confirmed =
        before !== null &&
        !isHand(before) &&
        before.volumeId === volumeId &&
        before.image === image;
      const filming = await facts.filmingOf(volumeId);
      const pagePinned = ref.page !== null && linked;
      if (pagePinned) {
        await facts.savePagePin(filming, ref, { volume, image, by: 'hand' });
      }
      const entry = marks.change(() => {
        const drawn = target.box;
        const box =
          drawn === undefined
            ? boxThere(marks.linkOf(key), filming, image)
            : drawn === null
              ? {}
              : { box: drawn };
        const own = !pagePinned || ref.recordId !== null || 'box' in box;
        const link: CitationLink = {
          volumeId,
          volume,
          image,
          ...fileOf(filming, image),
          ...box,
          by: 'hand'
        };
        marks.write(key, own ? link : null);
        return 'box' in box;
      });
      return {
        at: entry ? 'entry' : 'image',
        volume,
        confirmed,
        citations,
        pagePin: pagePinned ? ref.page : null
      };
    },

    // A match the vision model confirmed. A Mark is never replaced. The cited page
    // becomes a Page pin only where the model read it on that very Image.
    async recordMatch(ref: ChurchBookRef, match: PixelMatch) {
      const key = markKey(ref);
      const { volumeId, volume, image, box } = match;
      const filming = await facts.filmingOf(volumeId);
      marks.change(() => {
        const known = marks.linkOf(key);
        const weighed = known !== null && !leavesOut(filming, known);
        if (!(weighed && isHand(known))) {
          marks.write(key, {
            volumeId,
            volume,
            image,
            ...fileOf(filming, image),
            box,
            by: 'vision'
          });
        }
      });
      if (ref.recordId !== null && ref.page !== null) {
        if (match.onCitedPage) {
          await facts.savePagePin(filming, ref, {
            volume,
            image,
            by: 'vision'
          });
        }
      }
    },

    // Takes back the Box the reference's Link shows at `at`, a Mark's or a
    // Match's. Page pins and Record ranges stay, as facts about the
    // Volume. A Match taken back is only undone. What it did, or null
    // when there was no Box there to take back.
    async recordDiscard(
      ref: ChurchBookRef,
      at: BoxAt
    ): Promise<DiscardDone | null> {
      const key = markKey(ref);
      return await Promise.resolve(
        marks.change(() => {
          const link = marks.linkOf(key);
          if (
            link?.volumeId !== at.volumeId ||
            link.image !== at.image ||
            link.box === undefined
          ) {
            return null;
          }
          marks.write(key, null);
          return { volume: link.volume, match: !isHand(link) };
        })
      );
    }
  };
}

export type PinStore = ReturnType<typeof openPins>;
