// Astia scan links for church-book citations, resolved on demand, and
// corrections to them made in the app.

import { join } from 'node:path';

import type { Scan, ScanResolution } from '@common/types';

import { addLocalAnchor, loadAnchors, setLocalAnchorsFile } from './anchors';
import { setCacheDir, volumeImages } from './astia';
import { resolveCitation } from './locate';
import { CHURCH_COLLECTIONS, collectionOf, parseCitation } from './record';

// Astia's cache and the local anchors live beside the datasets; the
// registry lists only slug-named folders, so neither shows as a dataset.
export function useDataFolder(root: string) {
  setCacheDir(join(root, '.astia-cache'));
  setLocalAnchorsFile(join(root, 'anchors.local.json'));
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
    return await resolveCitation(
      parseCitation(page, text ?? ''),
      await loadAnchors()
    );
  } catch {
    return { error: 'Astia unavailable' };
  }
}

// Where the user says the cited page is: an image of the volume already
// linked, or an Astia viewer link (which names its volume and file).
export type Correction = { volumeId: string; image: number } | { url: string };

export type CorrectionResult = ScanResolution | { rejected: string };

async function imageOfLink(link: string) {
  const url = URL.canParse(link) ? new URL(link) : null;
  const fileId = url?.searchParams.get('fileId') ?? null;
  const volumeId = url?.searchParams.get('aineistoId') ?? null;
  if (fileId === null || volumeId === null) return null;
  const image = (await volumeImages(volumeId)).indexOf(fileId) + 1;
  return image === 0 ? null : { volumeId, image };
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

export async function correctScan(
  page: string,
  text: string | null,
  correction: Correction
): Promise<CorrectionResult> {
  const citation = parseCitation(page, text ?? '');
  if (citation.page === null) {
    return { rejected: 'The citation names no page to place.' };
  }
  const target =
    'url' in correction ? await imageOfLink(correction.url) : correction;
  if (target === null) return { rejected: "That isn't an Astia image link." };
  const current = await resolveScans(page, text);
  const linked: Scan[] = 'scans' in current ? current.scans : [];
  const scan = linked.find((s) => s.volumeId === target.volumeId);
  if (scan === undefined) {
    return { rejected: 'That image is from a different volume.' };
  }
  const count = (await volumeImages(target.volumeId)).length;
  if (
    !Number.isInteger(target.image) ||
    target.image < 1 ||
    target.image > count
  ) {
    return { rejected: `The volume has images 1–${count}.` };
  }
  await addLocalAnchor(target.volumeId, scan.volume, {
    image: target.image,
    pages: await pagesFor(target.volumeId, citation.page, citation.kind),
    note: 'placed by hand in the app'
  });
  return await resolveScans(page, text);
}
