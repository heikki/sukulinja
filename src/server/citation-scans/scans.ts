// Astia scan links for church-book citations, resolved on demand, and
// corrections to them made in the app.

import { join } from 'node:path';

import type { ScanResolution } from '@common/types';

import {
  addLocalAnchor,
  loadAnchors,
  loadPlacements,
  setLocalFolder,
  setPlacement
} from './anchors';
import { imageOfFile, setCacheDir, volumeImages } from './astia';
import { parishVolumes, resolveChurchBookRef } from './locate';
import { CHURCH_COLLECTIONS, collectionOf, parseChurchBookRef } from './record';
import type { ChurchBookRef } from './record';

// Astia's cache and the local corrections live beside the datasets; the
// registry lists only slug-named folders, so neither shows as a dataset.
export function useDataFolder(root: string) {
  setCacheDir(join(root, '.astia-cache'));
  setLocalFolder(root);
}

export function isChurchBook(page: string | null): page is string {
  const collection = page === null ? null : collectionOf(page);
  return collection !== null && CHURCH_COLLECTIONS.has(collection);
}

export async function resolveScans(
  page: string,
  text: string | null
): Promise<ScanResolution> {
  try {
    return await resolveChurchBookRef(
      parseChurchBookRef(page, text ?? ''),
      await loadAnchors(),
      await loadPlacements()
    );
  } catch {
    return { error: 'Astia unavailable' };
  }
}

// Where the user says the record is: an image of the volume linked first,
// or an Astia viewer link (which names its volume and file).
export type Correction = { volumeId: string; image: number } | { url: string };

export type CorrectionResult = ScanResolution | { rejected: string };

async function imageOfLink(link: string) {
  const url = URL.canParse(link) ? new URL(link) : null;
  const fileId = url?.searchParams.get('fileId') ?? null;
  const volumeId = url?.searchParams.get('aineistoId') ?? null;
  if (fileId === null || volumeId === null) return null;
  const image = await imageOfFile(volumeId, fileId);
  return image === null ? null : { volumeId, image };
}

// A volume numbered by page carries two numbers per image; the new anchor
// follows the ones already read in that volume, or the book type.
async function pagesFor(volumeId: string, page: number, kind: string | null) {
  const known = (await loadAnchors())[volumeId]?.anchors ?? [];
  const twoPages =
    known.length > 0
      ? known.some((a) => a.pages.length === 2)
      : kind === 'lasten';
  return twoPages ? [page, page + 1] : [page];
}

// A cited page found in a volume the reference already links is an anchor,
// which moves the volume's other references near it too. A record naming no
// page, or found in another volume of the parish, is placed on its own.
async function save(
  ref: ChurchBookRef,
  target: { volumeId: string; image: number },
  volume: string,
  linked: boolean
) {
  if (ref.page !== null && linked) {
    await setPlacement(ref.url, null);
    await addLocalAnchor(target.volumeId, volume, {
      image: target.image,
      pages: await pagesFor(target.volumeId, ref.page, ref.kind),
      note: 'placed by hand in the app'
    });
  } else {
    await setPlacement(ref.url, { ...target, volume });
  }
}

export async function correctScan(
  page: string,
  text: string | null,
  correction: Correction
): Promise<CorrectionResult> {
  const ref = parseChurchBookRef(page, text ?? '');
  const target =
    'url' in correction ? await imageOfLink(correction.url) : correction;
  if (target === null) return { rejected: "That isn't an Astia image link." };
  const volume = (await parishVolumes(ref.parish)).find(
    (v) => v.id === target.volumeId
  );
  if (volume === undefined) {
    return { rejected: "That image isn't in this parish's church books." };
  }
  const count = (await volumeImages(target.volumeId)).length;
  if (
    !Number.isInteger(target.image) ||
    target.image < 1 ||
    target.image > count
  ) {
    return { rejected: `The volume has images 1–${count}.` };
  }
  // Linked by the book it cites, not by an earlier placement.
  const matched = await resolveChurchBookRef(ref, await loadAnchors());
  const linked =
    'scans' in matched &&
    matched.scans.some((s) => s.volumeId === target.volumeId);
  await save(ref, target, volume.label, linked);
  return await resolveScans(page, text);
}
