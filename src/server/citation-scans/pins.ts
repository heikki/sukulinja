// What resolution reads (see locate.ts), and the saving of it. A base of
// Page pins and Record ranges (by default the ones shipped with the app in
// pins.json) has the data folder's pins.local.json read over it: the pins
// saved by a Mark in the app or by the vision pass. A newer Page pin
// replaces any on the same image or claiming one of its pages, so
// re-marking a page moves it; a newer Record pin replaces the record's
// earlier one.
//
// A pin saved by hand always wins: one the vision model saved never
// replaces a hand one (the base counts as by hand), and a hand one
// replaces it. A Discard takes a Box's pin back; a Vision match taken back
// is kept as a Rejection, so the model's match there isn't saved again.
//
// A pin on an Image keeps the Image's Astia file id, from the Volume's
// list when saved. One made on another filming of the Volume is left out
// of the clashes a save weighs, so it never keeps a pin for the filming
// now from being saved. Merging the local pins over the base can't tell,
// lacking the lists: a stale base Page pin still beats a vision one there
// until the base is fixed.
//
// How the local pins are kept on disk, and saved from two processes at
// once, is pin-files.ts.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Box } from '@common/types';

import type { Astia } from './astia';
import { isCurrent } from './locate';
import type {
  PagePin,
  Pins,
  RecordPin,
  RecordRange,
  ReferencePin,
  VolumePins
} from './locate';
import {
  fileStamp,
  migrate,
  readLocalFile,
  withLock,
  writeLocalFile
} from './pin-files';
import type { LocalPins } from './pin-files';
import shipped from './pins.json';
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

// Which pins of a list a save weighs: all of them, unless the list is of
// the Volume it saves into, whose stale pins it passes over.
type Weighs = (pin: { image?: number; fileId?: string }) => boolean;

function weighsAll() {
  return true;
}

function byImage(a: PagePin, b: PagePin) {
  return a.image - b.image;
}

function pageClash(pin: PagePin) {
  return (p: PagePin) =>
    p.image === pin.image || p.pages.some((n) => pin.pages.includes(n));
}

function withPagePin(
  pins: PagePin[],
  pin: PagePin,
  weighs: Weighs = weighsAll
) {
  const clashes = pageClash(pin);
  if (!overrides(pin, pins.filter(clashes).filter(weighs))) return pins;
  return [...pins.filter((p) => !clashes(p)), pin].sort(byImage);
}

function withRecordPin(pins: RecordPin[], pin: RecordPin) {
  function same(p: RecordPin) {
    return p.record === pin.record;
  }
  if (!overrides(pin, pins.filter(same))) return pins;
  return [...pins.filter((p) => !same(p)), pin];
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

function mergeVolume(base: VolumePins | undefined, local: VolumePins) {
  const from = base ?? { pages: [] };
  const lists = {
    villages: union(from.villages, local.villages),
    ranges: withRanges(union(from.ranges, local.ranges)),
    records: union(local.records).reduce(withRecordPin, union(from.records))
  };
  const pages = local.pages.reduce(
    (list, pin) => withPagePin(list, pin),
    from.pages
  );
  const out: VolumePins = { ...(base ?? local), pages };
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

// ---------------------------------------------------------------- saving

// A Vision match taken back by hand: the reference isn't on that Image,
// of the filming its file id is of.
export interface Rejection {
  volumeId: string;
  image: number;
  fileId?: string;
}

// The Volume a save is about, with its list as Astia gives it now.
interface Scope {
  volumeId: string;
  files: string[];
}

// One save's view of the pins: the local ones it changes, read under the
// lock, the base they're read over, and the Volume it saves into.
interface Draft {
  base: Pins['volumes'];
  local: LocalPins;
  scope: Scope;
}

// Whether the save weighs a pin of `volumeId`: not one made on another
// filming of the Volume it saves into.
function weighsIn(draft: Draft, volumeId: string): Weighs {
  const { scope } = draft;
  return scope.volumeId === volumeId
    ? (pin) => isCurrent(pin, scope.files)
    : weighsAll;
}

// The file id of the Image a save puts a pin on, when the list has it.
function fileOf(draft: Draft, image: number) {
  const fileId = draft.scope.files[image - 1];
  return fileId === undefined ? {} : { fileId };
}

function mergedVolumes(draft: Draft) {
  return merge(draft.base, draft.local.volumes);
}

function addPagePin(
  draft: Draft,
  volumeId: string,
  title: string,
  pin: PagePin
) {
  const weighs = weighsIn(draft, volumeId);
  const known = mergedVolumes(draft)[volumeId]?.pages ?? [];
  if (!overrides(pin, known.filter(pageClash(pin)).filter(weighs))) return;
  const { volumes } = draft.local;
  const volume = volumes[volumeId];
  volumes[volumeId] = {
    ...volume,
    title: volume?.title ?? title,
    pages: withPagePin(volume?.pages ?? [], pin, weighs)
  };
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

// A record pinned to an image of the volume. A record is on one image only,
// so the pin replaces the record's local pins in every volume; a vision pin
// is dropped where a hand one is known anywhere.
function addRecordPin(
  draft: Draft,
  volumeId: string,
  title: string,
  pin: RecordPin
) {
  const volumes = mergedVolumes(draft);
  const known = Object.entries(volumes).flatMap(([id, v]) =>
    (v.records ?? [])
      .filter((p) => p.record === pin.record)
      .filter(weighsIn(draft, id))
  );
  if (!overrides(pin, known)) return;
  for (const volume of Object.values(draft.local.volumes)) {
    const rest = volume.records?.filter((p) => p.record !== pin.record);
    if (rest === undefined) continue;
    if (rest.length > 0) volume.records = rest;
    else delete volume.records;
  }
  const volume = draft.local.volumes[volumeId] ?? { title, pages: [] };
  volume.records = [...(volume.records ?? []), pin];
  const range = extendedRange(volumes, volumeId, pin.record);
  if (range !== null) {
    volume.ranges = [
      ...(volume.ranges ?? []).filter((r) => !contains(range, r)),
      range
    ];
  }
  const { volumes: local } = draft.local;
  local[volumeId] = volume;
}

// Keyed by the reference's MyHeritage record URL, which survives re-imports.
function setReferencePin(draft: Draft, url: string, pin: ReferencePin | null) {
  const { references } = draft.local;
  const earlier = references[url];
  const weighed =
    earlier !== undefined && weighsIn(draft, earlier.volumeId)(earlier);
  if (pin !== null && weighed && !overrides(pin, [earlier])) return;
  const others = Object.entries(references).filter(([key]) => key !== url);
  const { local } = draft;
  local.references = Object.fromEntries(
    pin === null ? others : [...others, [url, pin]]
  );
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

// Where on the Image the vision model said the entry is, when its match is
// on the Image now marked: confirming the match by hand keeps it.
function matchedBox(
  draft: Draft,
  ref: ChurchBookRef,
  target: { volumeId: string; image: number }
) {
  const saved =
    ref.recordId === null
      ? draft.local.references[ref.url]
      : mergedVolumes(draft)[target.volumeId]?.records?.find(
          (p) => p.record === ref.recordId
        );
  if (saved?.image !== target.image || saved.box === undefined) return {};
  const inVolume = !('volumeId' in saved) || saved.volumeId === target.volumeId;
  const current = weighsIn(draft, target.volumeId)(saved);
  return inVolume && current ? { box: saved.box } : {};
}

// Where a Mark says the record is, in any Volume of the parish: on an
// Image, or only somewhere in the Volume. On an Image, `box` is where the
// entry is drawn, null for none; left out, a Vision match's Box on that
// Image is kept, as confirming one does.
export interface MarkTarget {
  volumeId: string;
  image?: number;
  box?: Box | null;
}

// A match the vision model confirmed on an Image, with the entry's Box.
export interface VisionMatch {
  volumeId: string;
  volume: string;
  image: number;
  // Whether the model read the cited page on that very Image.
  onCitedPage: boolean;
  box: Box;
}

// A Mark of only the Volume is the reference's own: a Reference pin with
// no Image, and nothing its neighbours count from. On an Image, a cited
// page found in a volume the reference already links is a Page pin, which
// moves the volume's other references near it too. A reference naming no
// page, or found in another volume of the parish, gets a Reference pin.
// Either way a record with a Record number gets a Record pin, which
// extends the volume's Record range so the records numbered around it
// follow. A Page pin keeps no Box, so a reference with neither a Record
// number nor a Reference pin keeps its drawn Box on a Reference pin too.
function markInto(
  draft: Draft,
  ref: ChurchBookRef,
  target: MarkTarget,
  where: { volume: string; linked: boolean }
) {
  const { volume, linked } = where;
  const { volumeId, image } = target;
  if (image === undefined) {
    setReferencePin(draft, ref.url, { volumeId, volume, by: 'hand' });
    return;
  }
  const on = { volumeId, image, ...fileOf(draft, image) };
  const drawn = target.box;
  const box =
    drawn === undefined
      ? matchedBox(draft, ref, on)
      : drawn === null
        ? {}
        : { box: drawn };
  if (ref.page !== null && linked) {
    const keep = ref.recordId === null && 'box' in box;
    setReferencePin(
      draft,
      ref.url,
      keep ? { ...on, volume, by: 'hand', ...box } : null
    );
    addPagePin(draft, volumeId, volume, {
      image,
      pages: pagesFor(draft, volumeId, ref),
      note: 'marked in the app',
      by: 'hand',
      ...fileOf(draft, image)
    });
  } else {
    setReferencePin(draft, ref.url, { ...on, volume, by: 'hand', ...box });
  }
  if (ref.recordId !== null) {
    addRecordPin(draft, volumeId, volume, {
      record: ref.recordId,
      image,
      by: 'hand',
      ...box,
      ...fileOf(draft, image)
    });
  }
}

// Saved the way a Mark is, as the model's: a Record pin for a record with
// a Record number, else a Reference pin. The cited page becomes a Page pin
// only where the model read it on that very Image. A hand pin is never
// replaced.
function visionInto(draft: Draft, ref: ChurchBookRef, match: VisionMatch) {
  const { volumeId, volume, image, box } = match;
  const file = fileOf(draft, image);
  if (ref.recordId === null) {
    setReferencePin(draft, ref.url, {
      volumeId,
      volume,
      image,
      by: 'vision',
      box,
      ...file
    });
    return;
  }
  addRecordPin(draft, volumeId, volume, {
    record: ref.recordId,
    image,
    by: 'vision',
    box,
    ...file
  });
  if (ref.page !== null && match.onCitedPage) {
    addPagePin(draft, volumeId, volume, {
      image,
      pages: pagesFor(draft, volumeId, ref),
      note: 'read by the vision model',
      by: 'vision',
      ...file
    });
  }
}

// Where a Box is: on an Image of a Volume.
export interface BoxAt {
  volumeId: string;
  image: number;
}

// Whether a Vision match at `at` was taken back there by hand, on the
// filming of the Volume the draft has the list of.
function isRejected(draft: Draft, ref: ChurchBookRef, at: BoxAt) {
  return (draft.local.rejected[ref.url] ?? []).some(
    (r) =>
      r.volumeId === at.volumeId &&
      r.image === at.image &&
      weighsIn(draft, r.volumeId)(r)
  );
}

function boxedAt(pin: { image?: number; box?: Box }, at: BoxAt) {
  return pin.image === at.image && pin.box !== undefined;
}

// The reference's own pin, taken off when it boxes the entry at `at`.
function takeReferencePin(draft: Draft, ref: ChurchBookRef, at: BoxAt) {
  const own = draft.local.references[ref.url];
  if (own?.volumeId !== at.volumeId || !boxedAt(own, at)) return null;
  setReferencePin(draft, ref.url, null);
  return own;
}

// The record's pin in the Volume, taken off when it boxes the entry at `at`.
function takeRecordPin(draft: Draft, ref: ChurchBookRef, at: BoxAt) {
  const volume = draft.local.volumes[at.volumeId];
  const pin = volume?.records?.find((p) => p.record === ref.recordId);
  if (volume === undefined || pin === undefined || !boxedAt(pin, at)) {
    return null;
  }
  const rest = volume.records!.filter((p) => p !== pin);
  if (rest.length > 0) volume.records = rest;
  else delete volume.records;
  return pin;
}

// Takes back the Box the reference's Link shows at `at`: its Reference pin
// there and its record's Record pin there, by hand or by the model. Page
// pins and Record ranges stay, as facts about the Volume. A Vision match
// taken back becomes a Rejection. Whether there was a Box to take back.
function discardInto(draft: Draft, ref: ChurchBookRef, at: BoxAt) {
  const taken = [
    takeReferencePin(draft, ref, at),
    takeRecordPin(draft, ref, at)
  ].filter((p) => p !== null);
  if (taken.some((p) => !isHand(p)) && !isRejected(draft, ref, at)) {
    const { rejected } = draft.local;
    const rejection = {
      volumeId: at.volumeId,
      image: at.image,
      ...fileOf(draft, at.image)
    };
    rejected[ref.url] = [
      ...(rejected[ref.url] ?? []).filter(
        (r) => r.volumeId !== at.volumeId || r.image !== at.image
      ),
      rejection
    ];
  }
  return taken.length > 0;
}

// ---------------------------------------------------------------- the module

// The pins of a data folder, saved with file ids from `astia`'s lists.
// `base` is what the local pins are read over: the shipped ones unless
// given.
export function openPins(
  folder: string,
  options: { astia: Astia; base?: Pins['volumes'] }
) {
  const { astia } = options;
  const base = options.base ?? SHIPPED;
  const localFile = join(folder, 'pins.local.json');
  const lockFile = join(folder, 'pins.lock');
  let migration: Promise<void> | null = null;
  let merged: { stamp: string; pins: Promise<Pins> } | null = null;

  async function migrated() {
    migration ??= (async () => {
      if (await Bun.file(localFile).exists()) return;
      await mkdir(folder, { recursive: true });
      await withLock(lockFile, async () => {
        await migrate(folder, localFile);
      });
    })();
    await migration;
  }

  async function readLocal() {
    await migrated();
    return await readLocalFile(localFile);
  }

  // The Volume, with its list when the save puts a pin on an Image.
  async function scopeOf(volumeId: string, onImage: boolean) {
    const files = onImage ? await astia.volumeImages(volumeId) : [];
    return { volumeId, files };
  }

  async function save<T>(scope: Scope, change: (draft: Draft) => T) {
    await migrated();
    await mkdir(folder, { recursive: true });
    const result = await withLock(lockFile, async () => {
      const draft = { base, local: await readLocal(), scope };
      const changed = change(draft);
      await writeLocalFile(localFile, draft.local);
      return changed;
    });
    merged = null;
    return result;
  }

  async function stamp() {
    return await fileStamp(localFile);
  }

  return {
    // What resolution reads: the base with the local pins over it, and
    // the Reference pins. Kept while the local file is unchanged.
    async snapshot() {
      const now = await stamp();
      if (merged?.stamp !== now) {
        merged = {
          stamp: now,
          pins: readLocal().then((l) => ({
            volumes: merge(base, l.volumes),
            references: l.references
          }))
        };
      }
      return await merged.pins;
    },

    // Changes whenever the local pins do, from this process or another.
    stamp,

    // The pins as kept, before the local ones are read over the base.
    async kept() {
      return { shipped: base, local: await readLocal() };
    },

    // A Mark: the reference's record is on the Image, or in the Volume when
    // the target gives none. `volume` is the
    // Volume's title; `linked`, whether the reference links that Volume by
    // the Book it cites. One write.
    async recordMark(
      ref: ChurchBookRef,
      target: MarkTarget,
      where: { volume: string; linked: boolean }
    ) {
      const onImage = target.image !== undefined;
      await save(await scopeOf(target.volumeId, onImage), (draft) => {
        markInto(draft, ref, target, where);
      });
    },

    // A match the vision model confirmed, unless it was taken back there by
    // hand; whether it was saved. One write.
    async recordVision(ref: ChurchBookRef, match: VisionMatch) {
      return await save(await scopeOf(match.volumeId, true), (draft) => {
        if (isRejected(draft, ref, match)) return false;
        visionInto(draft, ref, match);
        return true;
      });
    },

    // A Discard of the reference's Box at `at`; whether there was one.
    // One write.
    async recordDiscard(ref: ChurchBookRef, at: BoxAt) {
      return await save(await scopeOf(at.volumeId, true), (draft) =>
        discardInto(draft, ref, at)
      );
    },

    // Whether a Vision match at `at` was taken back by hand.
    async rejects(ref: ChurchBookRef, at: BoxAt) {
      const scope = await scopeOf(at.volumeId, true);
      return isRejected({ base, local: await readLocal(), scope }, ref, at);
    }
  };
}

export type PinStore = ReturnType<typeof openPins>;
