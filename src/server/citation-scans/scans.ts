// Astia Links for Church-book references, resolved on demand, and
// the Marks made in the app.

import { join } from 'node:path';

import type { Box, Link } from '@common/types';

import { archiveVolumes, setCacheDir, volumeImages } from './astia';
import { setImageCacheDir } from './images';
import { parishArchive, parishVolumes, resolveChurchBookRef } from './locate';
import type { Candidate } from './matcher';
import {
  addPagePin,
  addRecordPin,
  loadPins,
  setLocalFolder,
  setReferencePin
} from './pins';
import type { ChurchBookRef } from './record';
import { useScanCacheSettings } from './scan-cache';

// Astia's caches and the local pins live beside the datasets; the
// registry lists only slug-named folders, so none shows as a dataset.
export function useDataFolder(root: string) {
  setCacheDir(join(root, '.astia-cache'));
  setImageCacheDir(join(root, '.astia-images'));
  setLocalFolder(root);
  useScanCacheSettings(root);
}

// Where the reference links, with the pins saved so far.
export async function resolveRef(ref: ChurchBookRef) {
  try {
    return await resolveChurchBookRef(ref, await loadPins());
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
export interface VolumeLink {
  link: Link;
  // One of several candidate Volumes.
  split: boolean;
}

// Each reference's Link in the Volume, or null for one resolving elsewhere;
// null for them all when the Volume is in none of their parishes. Only the
// Volume's parish's references are resolved: another parish's would crawl
// its Volumes from Astia.
export async function volumeLinks(volumeId: string, refs: ChurchBookRef[]) {
  const archive = await archiveOf(
    volumeId,
    refs.map((r) => r.parish)
  );
  if (archive === null) return null;
  const pins = await loadPins();
  return await Promise.all(
    refs.map(async (ref): Promise<VolumeLink | null> => {
      if (parishArchive(ref.parish) !== archive) return null;
      const resolved = await resolveChurchBookRef(ref, pins);
      if ('error' in resolved) return null;
      const link = resolved.links.find((l) => l.volumeId === volumeId);
      return link === undefined
        ? null
        : { link, split: resolved.links.length > 1 };
    })
  );
}

// The Image a Mark says the record is on, in any Volume of the parish.
export interface MarkTarget {
  volumeId: string;
  image: number;
}

// The pins resolution reads, but no Reference pins: a reference's links by
// the Book it cites, not by where it was pinned before.
async function byBook() {
  return { volumes: (await loadPins()).volumes, references: {} };
}

// The Volumes the reference links by the Book it cites, with its Image in
// each: marking an Image in one of them saves a Page pin.
async function linkedImages(ref: ChurchBookRef) {
  const matched = await resolveChurchBookRef(ref, await byBook());
  const links = 'links' in matched ? matched.links : [];
  return new Map(links.map((l) => [l.volumeId, l.image]));
}

// The Volumes the existing resolution links a reference to, by the Book it
// cites, with each one's Image count, years and the Image it links if any:
// where the matcher searches.
export async function matchCandidates(ref: ChurchBookRef) {
  const resolved = await resolveChurchBookRef(ref, await byBook());
  if ('error' in resolved) return [];
  const volumes = await parishVolumes(ref.parish);
  return await Promise.all(
    resolved.links.map(async (l): Promise<Candidate> => ({
      volumeId: l.volumeId,
      volume: l.volume,
      images: (await volumeImages(l.volumeId)).length,
      years: volumes.find((v) => v.id === l.volumeId)?.years ?? null,
      start: l.certainty === 'volume' ? null : l.image
    }))
  );
}

// A volume numbered by page carries two numbers per image; the new Page pin
// follows the ones already in that volume, or the book type.
async function pagesFor(volumeId: string, page: number, kind: string | null) {
  const known = (await loadPins()).volumes[volumeId]?.pages ?? [];
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
  const pins = await loadPins();
  const saved =
    ref.recordId === null
      ? pins.references[ref.url]
      : pins.volumes[target.volumeId]?.records?.find(
          (p) => p.record === ref.recordId
        );
  if (saved?.image !== target.image || saved.box === undefined) return {};
  const inVolume = !('volumeId' in saved) || saved.volumeId === target.volumeId;
  return inVolume ? { box: saved.box } : {};
}

// A cited page found in a volume the reference already links is a Page
// pin, which moves the volume's other references near it too. A reference
// naming no page, or found in another volume of the parish, gets a
// Reference pin. Either way a record with a Record number gets a Record
// pin, which extends the volume's Record range so the records numbered
// around it follow.
async function save(
  ref: ChurchBookRef,
  target: { volumeId: string; image: number },
  volume: string,
  linked: boolean
) {
  const box = await matchedBox(ref, target);
  if (ref.page !== null && linked) {
    await setReferencePin(ref.url, null);
    await addPagePin(target.volumeId, volume, {
      image: target.image,
      pages: await pagesFor(target.volumeId, ref.page, ref.kind),
      note: 'marked in the app',
      by: 'hand'
    });
  } else {
    await setReferencePin(ref.url, { ...target, volume, by: 'hand', ...box });
  }
  if (ref.recordId !== null) {
    await addRecordPin(target.volumeId, volume, {
      record: ref.recordId,
      image: target.image,
      by: 'hand',
      ...box
    });
  }
}

// A match the vision model confirmed, saved the way a Mark is, as the
// model's: a Record pin for a record with a Record number, else a Reference
// pin. The cited page becomes a Page pin only where the model read it on
// that very Image. A hand pin is never replaced.
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
    await setReferencePin(ref.url, {
      volumeId,
      volume,
      image,
      by: 'vision',
      ...box
    });
    return;
  }
  await addRecordPin(volumeId, volume, {
    record: ref.recordId,
    image,
    by: 'vision',
    ...box
  });
  if (ref.page !== null && match.onCitedPage) {
    await addPagePin(volumeId, volume, {
      image,
      pages: await pagesFor(volumeId, ref.page, ref.kind),
      note: 'read by the vision model',
      by: 'vision'
    });
  }
}

// Saves a Mark, and gives the reference's links as they now resolve.
export async function markRef(ref: ChurchBookRef, target: MarkTarget) {
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
  return await resolveRef(ref);
}
