// What placement reads (see locate.ts). Anchors ship with the app in
// anchors.json; corrections made in the app go to local files in the data
// folder: anchors and seen records read over the shipped ones, and records
// placed by hand. A newer anchor replaces any on the same image or claiming
// one of its pages, so re-correcting a page moves it; a newer seen record
// replaces the record's earlier one.
//
// A correction by hand always wins: one matched by the vision model never
// replaces a hand one (shipped ones count as by hand), and a hand one
// replaces it.
//
// The vision pass saves from a script while the app runs, so what's read
// is kept only while the local files are unchanged.

import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import shipped from './anchors.json';
import type {
  Anchor,
  Anchors,
  Placement,
  Placements,
  RecordRange,
  SeenRecord
} from './locate';

let localFile = resolve('data/anchors.local.json');
let placementsFile = resolve('data/placements.local.json');
let merged: { stamp: string; anchors: Promise<Anchors> } | null = null;

export function setLocalFolder(dir: string) {
  localFile = join(dir, 'anchors.local.json');
  placementsFile = join(dir, 'placements.local.json');
  merged = null;
}

async function fileStamp(path: string) {
  const info = await stat(path).catch(() => null);
  return info === null ? '-' : `${info.mtimeMs}:${info.size}`;
}

// Changes whenever a correction or a vision save writes the local anchors
// or placements, from this process or another.
export async function localStamp() {
  const stamps = await Promise.all([localFile, placementsFile].map(fileStamp));
  return stamps.join(' ');
}

async function readLocal() {
  const file = Bun.file(localFile);
  return (await file.exists()) ? ((await file.json()) as Anchors) : {};
}

async function writeLocal(local: Anchors) {
  await Bun.write(localFile, `${JSON.stringify(local, null, 2)}\n`);
  merged = null;
}

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

function byImage(a: Anchor, b: Anchor) {
  return a.image - b.image;
}

function anchorClash(anchor: Anchor) {
  return (a: Anchor) =>
    a.image === anchor.image || a.pages.some((p) => anchor.pages.includes(p));
}

function withAnchor(anchors: Anchor[], anchor: Anchor) {
  const clashes = anchorClash(anchor);
  if (!overrides(anchor, anchors.filter(clashes))) return anchors;
  return [...anchors.filter((a) => !clashes(a)), anchor].sort(byImage);
}

function withSeen(seen: SeenRecord[], record: SeenRecord) {
  function same(s: SeenRecord) {
    return s.record === record.record;
  }
  if (!overrides(record, seen.filter(same))) return seen;
  return [...seen.filter((s) => !same(s)), record];
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

type VolumeAnchors = Anchors[string];

function union<T>(a: T[] = [], b: T[] = []) {
  return [...new Set([...a, ...b])];
}

function mergeVolume(base: VolumeAnchors | undefined, local: VolumeAnchors) {
  const from = base ?? { anchors: [] };
  const lists = {
    villages: union(from.villages, local.villages),
    records: withRanges(union(from.records, local.records)),
    seen: union(local.seen).reduce(withSeen, union(from.seen))
  };
  const anchors = local.anchors.reduce(withAnchor, from.anchors);
  const out: VolumeAnchors = { ...(base ?? local), anchors };
  for (const [key, list] of Object.entries(lists)) {
    if (list.length > 0) Object.assign(out, { [key]: list });
  }
  return out;
}

function merge(base: Anchors, local: Anchors) {
  const out: Anchors = { ...base };
  for (const [volumeId, volume] of Object.entries(local)) {
    out[volumeId] = mergeVolume(out[volumeId], volume);
  }
  return out;
}

export async function loadAnchors() {
  const stamp = await fileStamp(localFile);
  if (merged?.stamp !== stamp) {
    merged = { stamp, anchors: readLocal().then((l) => merge(shipped, l)) };
  }
  return await merged.anchors;
}

export async function addLocalAnchor(
  volumeId: string,
  title: string,
  anchor: Anchor
) {
  const known = (await loadAnchors())[volumeId]?.anchors ?? [];
  if (!overrides(anchor, known.filter(anchorClash(anchor)))) return;
  const local = await readLocal();
  local[volumeId] = {
    ...local[volumeId],
    title: local[volumeId]?.title ?? title,
    anchors: withAnchor(local[volumeId]?.anchors ?? [], anchor)
  };
  await writeLocal(local);
}

// The record range a seen record extends its volume's to, or null: none
// when a range of the volume already holds it, or when the extension would
// reach into another volume's range. A volume with no range starts one.
// Each volume's records form one unbroken block on its film, so the records
// numbered in between are on the volume too.
function extendedRange(anchors: Anchors, volumeId: string, record: number) {
  const own = anchors[volumeId]?.records ?? [];
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
  const others = Object.entries(anchors)
    .filter(([id]) => id !== volumeId)
    .flatMap(([, v]) => v.records ?? []);
  const blocked = others.some((r) => r.from <= range.to && range.from <= r.to);
  return blocked ? null : range;
}

// A record seen on an image of the volume. A record is on one image only,
// so it replaces the record's local entries in every volume; a vision match
// is dropped where a hand one is known anywhere.
export async function addLocalSeen(
  volumeId: string,
  title: string,
  seen: SeenRecord
) {
  const anchors = await loadAnchors();
  const known = Object.values(anchors).flatMap((v) =>
    (v.seen ?? []).filter((s) => s.record === seen.record)
  );
  if (!overrides(seen, known)) return;
  const local = await readLocal();
  for (const volume of Object.values(local)) {
    const rest = volume.seen?.filter((s) => s.record !== seen.record);
    if (rest === undefined) continue;
    if (rest.length > 0) volume.seen = rest;
    else delete volume.seen;
  }
  const volume = local[volumeId] ?? { title, anchors: [] };
  volume.seen = [...(volume.seen ?? []), seen];
  const range = extendedRange(anchors, volumeId, seen.record);
  if (range !== null) {
    volume.records = [
      ...(volume.records ?? []).filter((r) => !contains(range, r)),
      range
    ];
  }
  local[volumeId] = volume;
  await writeLocal(local);
}

// Keyed by the citation's MyHeritage record URL, which survives re-imports.
export async function loadPlacements() {
  const file = Bun.file(placementsFile);
  return (await file.exists()) ? ((await file.json()) as Placements) : {};
}

export async function setPlacement(
  record: string,
  placement: Placement | null
) {
  const current = await loadPlacements();
  const earlier = current[record];
  if (
    placement !== null &&
    earlier !== undefined &&
    !overrides(placement, [earlier])
  ) {
    return;
  }
  const others = Object.entries(current).filter(([key]) => key !== record);
  const placements = Object.fromEntries(
    placement === null ? others : [...others, [record, placement]]
  );
  await Bun.write(placementsFile, `${JSON.stringify(placements, null, 2)}\n`);
}
