// Astia Links for Church-book references, resolved on demand, and the
// Marks made in the app.

import { join } from 'node:path';

import type { Link } from '@common/types';

import type { Astia } from './astia';
import { setImageCacheDir } from './images';
import { parishArchive, parishVolumes, resolveChurchBookRef } from './locate';
import type { Candidate } from './matcher';
import type { MarkTarget, PinStore } from './pins';
import type { ChurchBookRef } from './record';
import { useScanCacheSettings } from './scan-cache';

// The Scan viewer's image cache and its setting live beside the datasets,
// as do the local pins (see openPins) and Astia's answers (openAstia's
// folder, by convention `.astia-cache`); the registry lists only slug-named
// folders, so none shows as a dataset.
export function useDataFolder(root: string) {
  setImageCacheDir(join(root, '.astia-images'));
  useScanCacheSettings(root);
}

// Where in the Volume a reference resolves.
export interface VolumeLink {
  link: Link;
  // One of several candidate Volumes.
  split: boolean;
}

// The pins resolution reads, but no Reference pins: a reference's links by
// the Book it cites, not by where it was pinned before.
async function byBook(pins: PinStore) {
  return { volumes: (await pins.snapshot()).volumes, references: {} };
}

// References resolved with the pins saved so far, against the Astia given.
export function openScans({ pins, astia }: { pins: PinStore; astia: Astia }) {
  // Where the reference links, with the pins saved so far.
  async function resolveRef(ref: ChurchBookRef) {
    try {
      return await resolveChurchBookRef(astia, ref, await pins.snapshot());
    } catch {
      return { error: 'Astia unavailable' };
    }
  }

  // The parish archive holding the Volume, looked for among the archives
  // of the parishes given, most cited first; an archive already crawled
  // costs no request. Null when none holds it; an archive that can't be
  // read is passed over, and throws only if the Volume isn't found
  // elsewhere.
  async function archiveOf(volumeId: string, parishes: Array<string | null>) {
    const cited = new Map<string, number>();
    for (const p of parishes) {
      const archive = parishArchive(p);
      if (archive !== null) cited.set(archive, (cited.get(archive) ?? 0) + 1);
    }
    const order = [...cited.keys()].sort(
      (a, b) => cited.get(b)! - cited.get(a)!
    );
    let failed: Error | null = null;
    for (const archive of order) {
      try {
        // eslint-disable-next-line no-await-in-loop -- stop at the first holding it
        const volumes = await astia.archiveVolumes(archive);
        if (volumes.some((v) => v.id === volumeId)) return archive;
      } catch (err) {
        failed = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (failed !== null) throw failed;
    return null;
  }

  // The Volumes the reference links by the Book it cites: marking an
  // Image in one of them saves a Page pin.
  async function linkedVolumes(ref: ChurchBookRef) {
    const matched = await resolveChurchBookRef(astia, ref, await byBook(pins));
    const links = 'links' in matched ? matched.links : [];
    return new Set(links.map((l) => l.volumeId));
  }

  return {
    resolveRef,

    // Changes when a save changes what references resolve to.
    stamp: () => pins.stamp(),

    // Each reference's Link in the Volume, or null for one resolving
    // elsewhere; null for them all when the Volume is in none of their
    // parishes. Only the Volume's parish's references are resolved:
    // another parish's would crawl its Volumes from Astia.
    async volumeLinks(volumeId: string, refs: ChurchBookRef[]) {
      const archive = await archiveOf(
        volumeId,
        refs.map((r) => r.parish)
      );
      if (archive === null) return null;
      const snapshot = await pins.snapshot();
      return await Promise.all(
        refs.map(async (ref): Promise<VolumeLink | null> => {
          if (parishArchive(ref.parish) !== archive) return null;
          const resolved = await resolveChurchBookRef(astia, ref, snapshot);
          if ('error' in resolved) return null;
          const link = resolved.links.find((l) => l.volumeId === volumeId);
          return link === undefined
            ? null
            : { link, split: resolved.links.length > 1 };
        })
      );
    },

    // The Volumes the existing resolution links a reference to, by the
    // Book it cites, with each one's Image count, years and the Image it
    // links if any: where the matcher searches.
    async matchCandidates(ref: ChurchBookRef) {
      const resolved = await resolveChurchBookRef(
        astia,
        ref,
        await byBook(pins)
      );
      if ('error' in resolved) return [];
      const volumes = await parishVolumes(astia, ref.parish);
      return await Promise.all(
        resolved.links.map(async (l): Promise<Candidate> => ({
          volumeId: l.volumeId,
          volume: l.volume,
          images: (await astia.volumeImages(l.volumeId)).length,
          years: volumes.find((v) => v.id === l.volumeId)?.years ?? null,
          start: l.precision === 'volume' ? null : l.image
        }))
      );
    },

    // Saves a Mark, and gives the reference's links as they now resolve.
    async markRef(ref: ChurchBookRef, target: MarkTarget) {
      const volume = (await parishVolumes(astia, ref.parish)).find(
        (v) => v.id === target.volumeId
      );
      if (volume === undefined) {
        return { rejected: "That image isn't in this parish's church books." };
      }
      const count = (await astia.volumeImages(target.volumeId)).length;
      if (
        !Number.isInteger(target.image) ||
        target.image < 1 ||
        target.image > count
      ) {
        return { rejected: `The volume has images 1–${count}.` };
      }
      const linked = (await linkedVolumes(ref)).has(target.volumeId);
      await pins.recordMark(ref, target, { volume: volume.label, linked });
      return await resolveRef(ref);
    }
  };
}

export type Scans = ReturnType<typeof openScans>;
