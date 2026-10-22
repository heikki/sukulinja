// Astia Links for Church-book references, resolved on demand, and the
// Marks made in the app.

import type {
  Box,
  Link,
  LinkResolution,
  VolumeChoice,
  VolumeChoices
} from '@common/types';

import { AstiaError } from './astia';
import type { Astia, Volume } from './astia';
import type { Viewport } from './jpeg';
import { parishArchive, parishVolumes, resolveChurchBookRef } from './locate';
import type { Candidate } from './matcher';
import type { BoxAt, MarkTarget, PinStore } from './pins';
import type { ChurchBookRef } from './record';

// The pins resolution reads, but no Reference pins: a reference's links by
// the Book it cites, not by where it was pinned before.
async function byBook(pins: PinStore) {
  return { volumes: (await pins.snapshot()).volumes, references: {} };
}

// The full-size Image's size in pixels, or null when it can't be told.
export type ImageSizeOf = (at: BoxAt) => Promise<Viewport | null>;

// A Box in whole pixels, with some width and height, within the Image when
// its size is known.
function onImage(box: Box, size: Viewport | null) {
  const { left, top, width, height } = box;
  return (
    [left, top, width, height].every(Number.isInteger) &&
    left >= 0 &&
    top >= 0 &&
    width > 0 &&
    height > 0 &&
    (size === null ||
      (left + width <= size.width && top + height <= size.height))
  );
}

const OFF_IMAGE = 'The entry box must lie on the Image, in whole pixels.';

// What's wrong with a Mark's entry Box, if anything.
async function boxProblem(
  { image, box, volumeId }: MarkTarget,
  sizeOf: ImageSizeOf
) {
  if (box === undefined || box === null) return null;
  if (image === undefined) return 'An entry box needs its Image.';
  const size = await sizeOf({ volumeId, image });
  return onImage(box, size) ? null : OFF_IMAGE;
}

function unknownSize() {
  return Promise.resolve(null);
}

function choiceOf(v: Volume): VolumeChoice {
  return { id: v.id, label: v.label, years: v.years };
}

// By first year; a Volume whose years can't be read goes last.
function byYears(a: Volume, b: Volume) {
  return (a.years?.from ?? Infinity) - (b.years?.from ?? Infinity);
}

const OLD_FILMING =
  'Astia has re-scanned this Volume. It can be changed once switched to the new filming.';

// References resolved with the pins saved so far, against the Astia given.
// `sizeOf` tells a Box past its Image's edges; without it, none is.
export function openScans({
  pins,
  astia,
  sizeOf = unknownSize
}: {
  pins: PinStore;
  astia: Astia;
  sizeOf?: ImageSizeOf;
}) {
  // Where the reference links, with the pins saved so far. A request to
  // Astia failing is a reason it has none for now; anything else thrown is
  // a bug, and is thrown on.
  async function resolveRef(ref: ChurchBookRef): Promise<LinkResolution> {
    try {
      return await resolveChurchBookRef(astia, ref, await pins.snapshot());
    } catch (err) {
      if (err instanceof AstiaError) return { unlinked: 'astia-error' };
      throw err;
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
    let failed: AstiaError | null = null;
    for (const archive of order) {
      try {
        // eslint-disable-next-line no-await-in-loop -- stop at the first holding it
        const volumes = await astia.archiveVolumes(archive);
        if (volumes.some((v) => v.id === volumeId)) return archive;
      } catch (err) {
        if (!(err instanceof AstiaError)) throw err;
        failed = err;
      }
    }
    if (failed !== null) throw failed;
    return null;
  }

  // The Volumes the reference links by the Book it cites: marking an
  // Image in one of them saves a Page pin.
  // Whether the Volume's cached list is of a filming Astia has replaced, as
  // found this run: it's read-only until switched, as what's saved on it
  // would be left out then. A re-scan changes every file id, so its first
  // tells.
  async function onOldFilming(volumeId: string) {
    const first = (await astia.volumeImages(volumeId))[0];
    return first !== undefined && (await astia.isGone(volumeId, first));
  }

  async function linkedVolumes(ref: ChurchBookRef) {
    const matched = await resolveChurchBookRef(astia, ref, await byBook(pins));
    const links = 'links' in matched ? matched.links : [];
    return new Set(links.map((l) => l.volumeId));
  }

  return {
    resolveRef,

    // Changes when a save, or a Volume's list kept anew, changes what
    // references resolve to.
    stamp: async () => `${await pins.stamp()}/${astia.refreshed()}`,

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
        refs.map(async (ref): Promise<Link | null> => {
          if (parishArchive(ref.parish) !== archive) return null;
          const resolved = await resolveChurchBookRef(astia, ref, snapshot);
          if ('unlinked' in resolved) return null;
          return resolved.links.find((l) => l.volumeId === volumeId) ?? null;
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
      if ('unlinked' in resolved) return [];
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

    // The digitized Volumes of the parish a reference can be put in: of
    // the Book it cites, those it links by that Book first.
    async volumeChoices(ref: ChurchBookRef): Promise<VolumeChoices> {
      const volumes = (await parishVolumes(astia, ref.parish)).filter(
        (v) => v.digitized && ref.kind !== null && v.kind === ref.kind
      );
      const linked = [...(await linkedVolumes(ref))];
      const fits = linked.flatMap((id) => {
        const v = volumes.find((u) => u.id === id);
        return v === undefined ? [] : [v];
      });
      const others = volumes
        .filter((v) => !linked.includes(v.id))
        .toSorted(byYears);
      return { fits: fits.map(choiceOf), others: others.map(choiceOf) };
    },

    // Saves a Mark, and gives the reference's links as they now resolve.
    async markRef(ref: ChurchBookRef, target: MarkTarget) {
      const volume = (await parishVolumes(astia, ref.parish)).find(
        (v) => v.id === target.volumeId
      );
      if (volume === undefined) {
        return { rejected: "That Volume isn't in this parish's church books." };
      }
      const boxed = await boxProblem(target, sizeOf);
      if (boxed !== null) return { rejected: boxed };
      if (await onOldFilming(target.volumeId)) return { rejected: OLD_FILMING };
      const { image } = target;
      if (image !== undefined) {
        const count = (await astia.volumeImages(target.volumeId)).length;
        if (!Number.isInteger(image) || image < 1 || image > count) {
          return { rejected: `The volume has images 1–${count}.` };
        }
      }
      const linked = (await linkedVolumes(ref)).has(target.volumeId);
      await pins.recordMark(ref, target, { volume: volume.label, linked });
      return await resolveRef(ref);
    },

    // The title of the archive holding the Volume, as a Link names it,
    // looked for among the `parishes`' archives; null when none holds it
    // or Astia can't say.
    async archiveTitleOf(volumeId: string, parishes: Array<string | null>) {
      try {
        const archive = await archiveOf(volumeId, parishes);
        return archive === null ? null : await astia.archiveTitle(archive);
      } catch (err) {
        if (err instanceof AstiaError) return null;
        throw err;
      }
    },

    // The label of the Volume an entry is cited in, by its Box on an Image
    // of the filming `fileId` is of; or why it can't be. The Volume must be
    // in one of the `parishes`.
    async imageToCite(
      at: { volumeId: string; image: number; fileId: string; box: Box },
      parishes: Array<string | null>
    ): Promise<{ volume: string } | { rejected: string }> {
      const { volumeId, image } = at;
      const archive = await archiveOf(volumeId, parishes);
      const volume =
        archive === null
          ? undefined
          : (await astia.archiveVolumes(archive)).find(
              (v) => v.id === volumeId
            );
      if (volume === undefined) {
        return { rejected: "That Volume isn't in this tree's church books." };
      }
      if (await onOldFilming(volumeId)) return { rejected: OLD_FILMING };
      const files = await astia.volumeImages(volumeId);
      if (!Number.isInteger(image) || image < 1 || image > files.length) {
        return { rejected: `The volume has images 1–${files.length}.` };
      }
      if (files[image - 1] !== at.fileId) {
        return { rejected: "That isn't the Image's file in Astia." };
      }
      if (!onImage(at.box, await sizeOf({ volumeId, image }))) {
        return { rejected: OFF_IMAGE };
      }
      return { volume: volume.label };
    },

    // Takes back the reference's Box at `at`, and gives its links as they
    // now resolve: its estimate, or a pin left without a Box.
    async discardRef(ref: ChurchBookRef, at: BoxAt) {
      if (await onOldFilming(at.volumeId)) return { rejected: OLD_FILMING };
      if (!(await pins.recordDiscard(ref, at))) {
        return { rejected: 'There is no box there to discard.' };
      }
      return await resolveRef(ref);
    }
  };
}

export type Scans = ReturnType<typeof openScans>;
