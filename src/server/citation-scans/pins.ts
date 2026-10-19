// What resolution reads (see locate.ts): Page pins and Record ranges ship
// with the app in pins.json; pins saved in the app or by the vision pass go
// to pins.local.json in the data folder, read over the shipped ones. A
// newer Page pin replaces any on the same image or claiming one of its
// pages, so re-marking a page moves it; a newer Record pin replaces the
// record's earlier one.
//
// A pin saved by hand always wins: one the vision model saved never
// replaces a hand one (shipped ones count as by hand), and a hand one
// replaces it.
//
// The vision pass saves from a script while the app runs, so what's read
// is kept only while the local file is unchanged.

import { rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type {
  PagePin,
  Pins,
  RecordPin,
  RecordRange,
  ReferencePin,
  VolumePins
} from './locate';
import shipped from './pins.json';

const BASE: Pins['volumes'] = shipped.volumes;

let folder = resolve('data');
let merged: { stamp: string; pins: Promise<Pins> } | null = null;
let migration: Promise<void> | null = null;

function localFile() {
  return join(folder, 'pins.local.json');
}

export function setLocalFolder(dir: string) {
  folder = dir;
  merged = null;
  migration = null;
}

async function fileStamp(path: string) {
  const info = await stat(path).catch(() => null);
  return info === null ? '-' : `${info.mtimeMs}:${info.size}`;
}

// Changes whenever a Mark or a vision save writes the local pins, from this
// process or another.
export async function localStamp() {
  return await fileStamp(localFile());
}

// Written whole under another name, then renamed over the file, so a
// reader never sees half of it.
async function writeJson(path: string, value: unknown) {
  const part = `${path}.part`;
  await Bun.write(part, `${JSON.stringify(value, null, 2)}\n`);
  await rename(part, path);
}

// ---------------------------------------------------------------- migration

// The local files before pins: Anchors, Seen records and Record ranges per
// volume in one, Placements in another.
interface OldVolume {
  title?: string;
  anchors?: PagePin[];
  villages?: string[];
  records?: RecordRange[];
  seen?: RecordPin[];
}

function fromOldVolume(old: OldVolume) {
  const { title, anchors, villages, records, seen } = old;
  const volume: VolumePins = { pages: anchors ?? [] };
  if (title !== undefined) volume.title = title;
  if (villages !== undefined) volume.villages = villages;
  if (records !== undefined) volume.ranges = records;
  if (seen !== undefined) volume.records = seen;
  return volume;
}

async function readIfThere<T>(path: string) {
  const file = Bun.file(path);
  return (await file.exists()) ? ((await file.json()) as T) : null;
}

// The first open of a folder saved before pins turns its two local files
// into pins.local.json, keeping them as *.migrated.
async function migrate() {
  if (await Bun.file(localFile()).exists()) return;
  const anchorsFile = join(folder, 'anchors.local.json');
  const placementsFile = join(folder, 'placements.local.json');
  const anchors = await readIfThere<Record<string, OldVolume>>(anchorsFile);
  const placements =
    await readIfThere<Record<string, ReferencePin>>(placementsFile);
  if (anchors === null && placements === null) return;
  const volumes = Object.fromEntries(
    Object.entries(anchors ?? {}).map(([id, v]) => [id, fromOldVolume(v)])
  );
  await writeJson(localFile(), { volumes, references: placements ?? {} });
  for (const old of [anchorsFile, placementsFile]) {
    // eslint-disable-next-line no-await-in-loop -- two files
    if (await Bun.file(old).exists()) await rename(old, `${old}.migrated`);
  }
}

async function readLocal() {
  migration ??= migrate();
  await migration;
  const local = await readIfThere<Partial<Pins>>(localFile());
  return { volumes: local?.volumes ?? {}, references: local?.references ?? {} };
}

async function writeLocal(local: Pins) {
  await writeJson(localFile(), local);
  merged = null;
}

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

function withPagePin(pins: PagePin[], pin: PagePin) {
  const clashes = pageClash(pin);
  if (!overrides(pin, pins.filter(clashes))) return pins;
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
// stands in for the shipped one it grew from.
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
  const pages = local.pages.reduce(withPagePin, from.pages);
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

// The shipped pins with the local ones over them.
export async function loadPins() {
  const stamp = await localStamp();
  if (merged?.stamp !== stamp) {
    merged = {
      stamp,
      pins: readLocal().then((l) => ({
        volumes: merge(BASE, l.volumes),
        references: l.references
      }))
    };
  }
  return await merged.pins;
}

// ---------------------------------------------------------------- saving

export async function addPagePin(
  volumeId: string,
  title: string,
  pin: PagePin
) {
  const known = (await loadPins()).volumes[volumeId]?.pages ?? [];
  if (!overrides(pin, known.filter(pageClash(pin)))) return;
  const local = await readLocal();
  const volume = local.volumes[volumeId];
  local.volumes[volumeId] = {
    ...volume,
    title: volume?.title ?? title,
    pages: withPagePin(volume?.pages ?? [], pin)
  };
  await writeLocal(local);
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
export async function addRecordPin(
  volumeId: string,
  title: string,
  pin: RecordPin
) {
  const { volumes } = await loadPins();
  const known = Object.values(volumes).flatMap((v) =>
    (v.records ?? []).filter((p) => p.record === pin.record)
  );
  if (!overrides(pin, known)) return;
  const local = await readLocal();
  for (const volume of Object.values(local.volumes)) {
    const rest = volume.records?.filter((p) => p.record !== pin.record);
    if (rest === undefined) continue;
    if (rest.length > 0) volume.records = rest;
    else delete volume.records;
  }
  const volume = local.volumes[volumeId] ?? { title, pages: [] };
  volume.records = [...(volume.records ?? []), pin];
  const range = extendedRange(volumes, volumeId, pin.record);
  if (range !== null) {
    volume.ranges = [
      ...(volume.ranges ?? []).filter((r) => !contains(range, r)),
      range
    ];
  }
  local.volumes[volumeId] = volume;
  await writeLocal(local);
}

// Keyed by the reference's MyHeritage record URL, which survives re-imports.
export async function setReferencePin(url: string, pin: ReferencePin | null) {
  const local = await readLocal();
  const earlier = local.references[url];
  if (pin !== null && earlier !== undefined && !overrides(pin, [earlier])) {
    return;
  }
  const others = Object.entries(local.references).filter(
    ([key]) => key !== url
  );
  local.references = Object.fromEntries(
    pin === null ? others : [...others, [url, pin]]
  );
  await writeLocal(local);
}
