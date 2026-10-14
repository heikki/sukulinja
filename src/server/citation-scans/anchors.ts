// The anchors placement reads (see locate.ts): those that ship with the app
// in anchors.json, with corrections made in the app read over them from a
// local file in the data folder. A newer anchor replaces any on the same
// image or claiming one of its pages, so re-correcting a page moves it.

import { resolve } from 'node:path';

import shipped from './anchors.json';
import type { Anchor, Anchors } from './locate';

let localFile = resolve('data/anchors.local.json');
let merged: Promise<Anchors> | null = null;

export function setLocalAnchorsFile(path: string) {
  localFile = path;
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
    out[volumeId] = { ...(out[volumeId] ?? volume), anchors };
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
