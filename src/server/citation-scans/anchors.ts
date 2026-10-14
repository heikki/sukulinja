// What placement reads (see locate.ts). Anchors ship with the app in
// anchors.json; corrections made in the app go to local files in the data
// folder: anchors read over the shipped ones, and records placed by hand.
// A newer anchor replaces any on the same image or claiming one of its
// pages, so re-correcting a page moves it.

import { join, resolve } from 'node:path';

import shipped from './anchors.json';
import type { Anchor, Anchors, Placement, Placements } from './locate';

let localFile = resolve('data/anchors.local.json');
let placementsFile = resolve('data/placements.local.json');
let merged: Promise<Anchors> | null = null;

export function setLocalFolder(dir: string) {
  localFile = join(dir, 'anchors.local.json');
  placementsFile = join(dir, 'placements.local.json');
  merged = null;
}

async function readLocal() {
  const file = Bun.file(localFile);
  return (await file.exists()) ? ((await file.json()) as Anchors) : {};
}

function byImage(a: Anchor, b: Anchor) {
  return a.image - b.image;
}

function withAnchor(anchors: Anchor[], anchor: Anchor) {
  function clashes(a: Anchor) {
    return (
      a.image === anchor.image || a.pages.some((p) => anchor.pages.includes(p))
    );
  }
  return [...anchors.filter((a) => !clashes(a)), anchor].sort(byImage);
}

function merge(base: Anchors, local: Anchors) {
  const out: Anchors = { ...base };
  for (const [volumeId, volume] of Object.entries(local)) {
    let anchors = out[volumeId]?.anchors ?? [];
    for (const a of volume.anchors) anchors = withAnchor(anchors, a);
    const villages = [
      ...new Set([
        ...(out[volumeId]?.villages ?? []),
        ...(volume.villages ?? [])
      ])
    ];
    out[volumeId] = {
      ...(out[volumeId] ?? volume),
      anchors,
      ...(villages.length > 0 ? { villages } : {})
    };
  }
  return out;
}

export function loadAnchors() {
  merged ??= readLocal().then((local) => merge(shipped, local));
  return merged;
}

export async function addLocalAnchor(
  volumeId: string,
  title: string,
  anchor: Anchor
) {
  const local = await readLocal();
  local[volumeId] = {
    title: local[volumeId]?.title ?? title,
    anchors: withAnchor(local[volumeId]?.anchors ?? [], anchor)
  };
  await Bun.write(localFile, `${JSON.stringify(local, null, 2)}\n`);
  merged = null;
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
  const others = Object.entries(await loadPlacements()).filter(
    ([key]) => key !== record
  );
  const placements = Object.fromEntries(
    placement === null ? others : [...others, [record, placement]]
  );
  await Bun.write(placementsFile, `${JSON.stringify(placements, null, 2)}\n`);
}
