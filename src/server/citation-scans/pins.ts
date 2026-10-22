// What resolution reads (see locate.ts), and the saving of it.
//
// Facts about Volumes are shared by every dataset: a base of Page pins and
// Record ranges (by default the ones shipped with the app in pins.json)
// with the data folder's pins.local.json read over it, where a Mark or the
// vision pass saves a Page pin. A newer Page pin replaces any on the same
// image or claiming one of its pages, so re-marking a page moves it.
//
// A dataset's Marks and Matches are in its citations (marks.ts,
// ADR-0013). Resolution reads each as a Reference pin of every reference
// citing its record, and, on an Image, as a Record pin, which extends its
// Volume's Record range for that dataset only.
//
// A Mark always wins: a Match never replaces one (the base counts
// as by hand), and a Mark replaces a Match. A Discard takes a Box
// back; a Match taken back is kept as a Rejection, so the model's
// match there isn't saved again.
//
// A pin on an Image keeps the Image's Astia file id, from the Volume's
// list when saved. One made on another filming of the Volume
// (filming.ts) is left out of the clashes a save weighs, so it never keeps
// a pin for the filming now from being saved. Merging the local pins over the base can't tell,
// lacking the lists: a stale base Page pin still beats a vision one there
// until the base is fixed.
//
// How the local file is kept on disk, and saved from two processes at
// once, is pin-files.ts.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Box } from '@common/types';

import type { CitationLink } from '../annotations';
import type { Astia } from './astia';
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
import type { Marks, Rejection } from './marks';
import {
  fileStamp,
  fillFileIds,
  migrate,
  readLocalFile,
  withLock,
  writeLocalFile
} from './pin-files';
import type { LocalPins } from './pin-files';
import shipped from './pins.json';
import { markKey } from './record';
import type { ChurchBookRef } from './record';

const SHIPPED: Pins['volumes'] = shipped.volumes;

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

function pageClash(pin: PagePin) {
  return (p: PagePin) =>
    p.image === pin.image || p.pages.some((n) => pin.pages.includes(n));
}

// The list with the Page pin in, unless a pin it clashes with wins. Saving
// into the Volume of `filming`, its stale pins aren't weighed.
function withPagePin(pins: PagePin[], pin: PagePin, filming?: Filming) {
  const clashes = pageClash(pin);
  const weighed = filming === undefined ? pins : split(filming, pins).current;
  if (!overrides(pin, weighed.filter(clashes))) return pins;
  return [...pins.filter((p) => !clashes(p)), pin].sort(byImage);
}

function covers(range: RecordRange, record: number) {
  return range.from <= record && record <= range.to;
}

function contains(outer: RecordRange, inner: RecordRange) {
  return outer.from <= inner.from && inner.to <= outer.to;
}

// Ranges with any one inside another left out, so an extended local range
// stands in for the base one it grew from.
function withRanges(ranges: RecordRange[]) {
  const all = ranges.filter(
    (r, i, list) =>
      list.findIndex((o) => o.from === r.from && o.to === r.to) === i
  );
  return all.filter((r) => !all.some((o) => o !== r && contains(o, r)));
}

function union<T>(a: T[] = [], b: T[] = []) {
  return [...new Set([...a, ...b])];
}

// A Volume's facts as the base and the local file give them. Record pins
// left in the file, which no dataset cites, aren't read.
function mergeVolume(base: VolumePins | undefined, local: VolumePins) {
  const from = base ?? { pages: [] };
  const lists = {
    villages: union(from.villages, local.villages),
    ranges: withRanges(union(from.ranges, local.ranges))
  };
  const pages = local.pages.reduce(
    (list, pin) => withPagePin(list, pin),
    from.pages
  );
  const { records: _left, ...rest } = base ?? local;
  const out: VolumePins = { ...rest, pages };
  for (const [key, list] of Object.entries(lists)) {
    if (list.length > 0) Object.assign(out, { [key]: list });
  }
  return out;
}

function merge(base: Pins['volumes'], local: Pins['volumes']) {
  const out = { ...base };
  for (const [volumeId, volume] of Object.entries(local)) {
    out[volumeId] = mergeVolume(out[volumeId], volume);
  }
  return out;
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

// One save's view of the local file, read under the lock, the base it's
// read over, and the filming of the Volume it saves into, as Astia lists
// it now.
interface Draft {
  base: Pins['volumes'];
  local: LocalPins;
  filming: Filming;
}

function fileOf(filming: Filming, image: number) {
  const fileId = filming.files[image - 1];
  return fileId === undefined ? {} : { fileId };
}

function mergedVolumes(draft: Draft) {
  return merge(draft.base, draft.local.volumes);
}

function addPagePin(draft: Draft, title: string, pin: PagePin) {
  const { filming } = draft;
  const { volumeId } = filming;
  const known = mergedVolumes(draft)[volumeId]?.pages ?? [];
  const weighed = split(filming, known).current;
  if (!overrides(pin, weighed.filter(pageClash(pin)))) return;
  const { volumes } = draft.local;
  const volume = volumes[volumeId];
  volumes[volumeId] = {
    ...volume,
    title: volume?.title ?? title,
    pages: withPagePin(volume?.pages ?? [], pin, filming)
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
// saved with file ids from `astia`'s lists. `base` is what the local file
// is read over: the shipped pins unless given.
export function openVolumeFacts(
  folder: string,
  options: { astia: Astia; base?: Pins['volumes'] }
) {
  const { astia } = options;
  const base = options.base ?? SHIPPED;
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

    // The base with the local file over it. Kept while the file is
    // unchanged.
    async volumes() {
      const now = await stamp();
      if (merged?.stamp !== now) {
        merged = {
          stamp: now,
          volumes: readLocal().then((l) => merge(base, l.volumes))
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
        const draft = { base, local: await readLocal(), filming };
        const pin = pagePin(draft, ref, at.image, at.by);
        addPagePin(draft, at.volume, pin);
        await writeLocalFile(localFile, draft.local);
      });
      merged = null;
    },

    // The pins as kept, before the local file is read over the base.
    async kept() {
      return { shipped: base, local: await readLocal() };
    }
  };
}

export type VolumeFacts = ReturnType<typeof openVolumeFacts>;

// ---------------------------------------------------------------- the module

// Where a Box is: on an Image of a Volume.
export interface BoxAt {
  volumeId: string;
  image: number;
}

// Where a Mark says the record is, in any Volume of the parish: on an
// Image, or only somewhere in the Volume. On an Image, `box` is where the
// entry is drawn, in pixels of the full-size Image, null for none; left
// out, a Match's Box on that Image is kept, as confirming one does.
export interface MarkTarget {
  volumeId: string;
  image?: number;
  box?: Box | null;
}

// A Match as saved: its Box in pixels of the full-size Image.
export interface PixelMatch {
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

// Whether a Match at `at` was taken back there by hand, on `filming`, the
// filming of its Volume now.
function isRejected(
  marks: Marks,
  ref: ChurchBookRef,
  filming: Filming,
  at: BoxAt
) {
  return marks
    .rejectionsOf(ref.url)
    .some(
      (r: Rejection) =>
        r.volumeId === at.volumeId &&
        r.image === at.image &&
        !leavesOut(filming, r)
    );
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
    // Reference pins for references with no Record number, and Rejections.
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
      return { volumes, references, rejected: marks.rejections() };
    },

    // A Mark: the reference's record is on the Image, or in the Volume when
    // the target gives none. `volume` is the Volume's label; `linked`,
    // whether the reference links that Volume by the Book it cites.
    //
    // Only a Volume is the record's own Link, and nothing its neighbours
    // count from. On an Image, a cited page found in a Volume the reference
    // already links is also a Page pin, which moves the Volume's other
    // references near it too; a reference with neither a Record number nor
    // a Box then needs no Link of its own.
    async recordMark(
      ref: ChurchBookRef,
      target: MarkTarget,
      where: { volume: string; linked: boolean }
    ) {
      const key = markKey(ref);
      const { volumeId, image } = target;
      const { volume, linked } = where;
      if (image === undefined) {
        marks.change(() => {
          marks.write(key, { volumeId, volume, by: 'hand' });
        });
        return;
      }
      const filming = await facts.filmingOf(volumeId);
      const pagePinned = ref.page !== null && linked;
      if (pagePinned) {
        await facts.savePagePin(filming, ref, { volume, image, by: 'hand' });
      }
      marks.change(() => {
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
      });
    },

    // A match the vision model confirmed, unless it was taken back there by
    // hand; whether it was saved. A Mark is never replaced. The cited page
    // becomes a Page pin only where the model read it on that very Image.
    async recordMatch(ref: ChurchBookRef, match: PixelMatch) {
      const key = markKey(ref);
      const { volumeId, volume, image, box } = match;
      const filming = await facts.filmingOf(volumeId);
      const saved = marks.change(() => {
        if (isRejected(marks, ref, filming, match)) return false;
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
        return true;
      });
      if (saved && ref.recordId !== null && ref.page !== null) {
        if (match.onCitedPage) {
          await facts.savePagePin(filming, ref, {
            volume,
            image,
            by: 'vision'
          });
        }
      }
      return saved;
    },

    // Takes back the Box the reference's Link shows at `at`, a Mark's or a
    // Match's. Page pins and Record ranges stay, as facts about the
    // Volume. A Match taken back becomes a Rejection. Whether there
    // was a Box to take back.
    async recordDiscard(ref: ChurchBookRef, at: BoxAt) {
      const key = markKey(ref);
      const filming = await facts.filmingOf(at.volumeId);
      return marks.change(() => {
        const link = marks.linkOf(key);
        if (
          link?.volumeId !== at.volumeId ||
          link.image !== at.image ||
          link.box === undefined
        ) {
          return false;
        }
        marks.write(key, null);
        if (!isHand(link) && !isRejected(marks, ref, filming, at)) {
          marks.reject(ref.url, { ...at, ...fileOf(filming, at.image) });
        }
        return true;
      });
    },

    // Whether a Match at `at` was taken back by hand.
    async rejects(ref: ChurchBookRef, at: BoxAt) {
      const filming = await facts.filmingOf(at.volumeId);
      return isRejected(marks, ref, filming, at);
    }
  };
}

export type PinStore = ReturnType<typeof openPins>;
