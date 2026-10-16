// Astia scan links for church-book citations, resolved on demand, and
// corrections to them made in the app.

import { join } from 'node:path';

import type { Box, Scan, ScanResolution } from '@common/types';

import {
  addLocalAnchor,
  addLocalSeen,
  loadAnchors,
  loadPlacements,
  setLocalFolder,
  setPlacement
} from './anchors';
import { archiveVolumes, setCacheDir, volumeImages } from './astia';
import { setImageCacheDir } from './images';
import { parishArchive, parishVolumes, resolveChurchBookRef } from './locate';
import type { Candidate } from './matcher';
import { CHURCH_COLLECTIONS, collectionOf, parseChurchBookRef } from './record';
import type { ChurchBookRef } from './record';
import { useScanCacheSettings } from './scan-cache';

// Astia's caches and the local corrections live beside the datasets; the
// registry lists only slug-named folders, so none shows as a dataset.
export function useDataFolder(root: string) {
  setCacheDir(join(root, '.astia-cache'));
  setImageCacheDir(join(root, '.astia-images'));
  setLocalFolder(root);
  useScanCacheSettings(root);
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

// The parish archive holding the Volume, looked for among the archives of
// the parishes given, most cited first; an archive already crawled costs no
// request. Null when none holds it; an archive that can't be read is passed
// over, and throws only if the Volume isn't found elsewhere.
async function archiveOf(volumeId: string, parishes: Array<string | null>) {
  const cited = new Map<string, number>();
  for (const p of parishes) {
    const archive = parishArchive(p);
    if (archive !== null) cited.set(archive, (cited.get(archive) ?? 0) + 1);
  }
  const order = [...cited.keys()].sort((a, b) => cited.get(b)! - cited.get(a)!);
  let failed: Error | null = null;
  for (const archive of order) {
    try {
      // eslint-disable-next-line no-await-in-loop -- stop at the first holding it
      const volumes = await archiveVolumes(archive);
      if (volumes.some((v) => v.id === volumeId)) return archive;
    } catch (err) {
      failed = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (failed !== null) throw failed;
  return null;
}

// Where in the Volume a reference resolves.
export interface VolumeScan {
  scan: Scan;
  // One of several candidate Volumes.
  split: boolean;
}

// Each reference's Scan in the Volume, or null for one resolving elsewhere;
// null for them all when the Volume is in none of their parishes. Only the
// Volume's parish's references are resolved: another parish's would crawl
// its Volumes from Astia.
export async function volumeScans(volumeId: string, refs: ChurchBookRef[]) {
  const archive = await archiveOf(
    volumeId,
    refs.map((r) => r.parish)
  );
  if (archive === null) return null;
  const [anchors, placements] = await Promise.all([
    loadAnchors(),
    loadPlacements()
  ]);
  return await Promise.all(
    refs.map(async (ref): Promise<VolumeScan | null> => {
      if (parishArchive(ref.parish) !== archive) return null;
      const resolved = await resolveChurchBookRef(ref, anchors, placements);
      if ('error' in resolved) return null;
      const scan = resolved.scans.find((s) => s.volumeId === volumeId);
      return scan === undefined
        ? null
        : { scan, split: resolved.scans.length > 1 };
    })
  );
}

// The Image the user marks as where the record is, in any Volume of the
// parish.
export interface Correction {
  volumeId: string;
  image: number;
}

export type CorrectionResult = ScanResolution | { rejected: string };

// The Volumes the reference links by the Book it cites, not by an earlier
// placement, with its Image in each: marking an Image in one of them saves
// an anchor.
async function linkedImages(ref: ChurchBookRef) {
  const matched = await resolveChurchBookRef(ref, await loadAnchors());
  const scans = 'scans' in matched ? matched.scans : [];
  return new Map(scans.map((s) => [s.volumeId, s.image]));
}

// The Volumes the existing resolution links a reference to, by the Book it
// cites, with each one's Image count, years and the Image it links if any:
// where the matcher searches.
export async function matchCandidates(ref: ChurchBookRef) {
  const resolved = await resolveChurchBookRef(ref, await loadAnchors());
  if ('error' in resolved) return [];
  const volumes = await parishVolumes(ref.parish);
  return await Promise.all(
    resolved.scans.map(async (s): Promise<Candidate> => ({
      volumeId: s.volumeId,
      volume: s.volume,
      images: (await volumeImages(s.volumeId)).length,
      years: volumes.find((v) => v.id === s.volumeId)?.years ?? null,
      start: s.method === 'volume' ? null : s.image
    }))
  );
}

// The parish's digitized Volumes a reference could be marked in.
export async function citationVolumes(page: string, text: string | null) {
  const ref = parseChurchBookRef(page, text ?? '');
  const [volumes, linked] = await Promise.all([
    parishVolumes(ref.parish),
    linkedImages(ref)
  ]);
  return volumes
    .filter((v) => v.digitized)
    .map((v) => ({
      id: v.id,
      label: v.label,
      kind: v.kind,
      years: v.years,
      image: linked.get(v.id) ?? null
    }));
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

// Where on the Image the vision model said the entry is, when its match is
// on the Image now marked: confirming the match by hand keeps it.
async function matchedBox(
  ref: ChurchBookRef,
  target: { volumeId: string; image: number }
) {
  const saved =
    ref.recordId === null
      ? (await loadPlacements())[ref.url]
      : (await loadAnchors())[target.volumeId]?.seen?.find(
          (s) => s.record === ref.recordId
        );
  if (saved?.image !== target.image || saved.box === undefined) return {};
  const inVolume = !('volumeId' in saved) || saved.volumeId === target.volumeId;
  return inVolume ? { box: saved.box } : {};
}

// A cited page found in a volume the reference already links is an anchor,
// which moves the volume's other references near it too. A record naming no
// page, or found in another volume of the parish, is placed on its own.
// Either way a record with a Record number is seen there, which extends
// the volume's record range so the records numbered around it follow.
async function save(
  ref: ChurchBookRef,
  target: { volumeId: string; image: number },
  volume: string,
  linked: boolean
) {
  const box = await matchedBox(ref, target);
  if (ref.page !== null && linked) {
    await setPlacement(ref.url, null);
    await addLocalAnchor(target.volumeId, volume, {
      image: target.image,
      pages: await pagesFor(target.volumeId, ref.page, ref.kind),
      note: 'placed by hand in the app',
      by: 'hand'
    });
  } else {
    await setPlacement(ref.url, { ...target, volume, by: 'hand', ...box });
  }
  if (ref.recordId !== null) {
    await addLocalSeen(target.volumeId, volume, {
      record: ref.recordId,
      image: target.image,
      by: 'hand',
      ...box
    });
  }
}

// A match the vision model confirmed, saved the way a hand correction is,
// marked as the model's: a Seen record for a record with a Record number,
// else a Placement. The cited page becomes an Anchor only where the model
// read it on that very Image. A hand entry is never replaced.
export async function saveVisionMatch(
  ref: ChurchBookRef,
  match: {
    volumeId: string;
    volume: string;
    image: number;
    onCitedPage: boolean;
    box: Box | null;
  }
) {
  const { volumeId, volume, image } = match;
  const box = match.box === null ? {} : { box: match.box };
  if (ref.recordId === null) {
    await setPlacement(ref.url, {
      volumeId,
      volume,
      image,
      by: 'vision',
      ...box
    });
    return;
  }
  await addLocalSeen(volumeId, volume, {
    record: ref.recordId,
    image,
    by: 'vision',
    ...box
  });
  if (ref.page !== null && match.onCitedPage) {
    await addLocalAnchor(volumeId, volume, {
      image,
      pages: await pagesFor(volumeId, ref.page, ref.kind),
      note: 'read by the vision model',
      by: 'vision'
    });
  }
}

export async function correctScan(
  page: string,
  text: string | null,
  target: Correction
): Promise<CorrectionResult> {
  const ref = parseChurchBookRef(page, text ?? '');
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
  const linked = (await linkedImages(ref)).has(target.volumeId);
  await save(ref, target, volume.label, linked);
  return await resolveScans(page, text);
}
