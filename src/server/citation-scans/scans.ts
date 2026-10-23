// Astia Links for Church-book references, resolved on demand, and every
// save of where one is: a Mark, a Match or a Discard. Opened by data
// folder, whose Page pins and Record ranges every dataset shares, then by
// dataset, whose Marks and Matches are in its citations.

import type { Database } from 'bun:sqlite';

import type {
  Box,
  Link,
  LinkResolution,
  VolumeChoice,
  VolumeChoices
} from '@/common/types';

import { AstiaError } from './astia';
import type { Astia, Volume } from './astia';
import { leavesOut } from './filming';
import type { Viewport } from './jpeg';
import { parishArchive, parishVolumes, resolveChurchBookRef } from './locate';
import type { Pins } from './locate';
import { openMarks } from './marks';
import type { Candidate, Match } from './matcher';
import { openPins, openVolumeFacts } from './pins';
import type { BoxAt, MarkTarget, PinStore } from './pins';
import type { Fractions } from './reader';
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

// A reading's Box in pixels of the full-size Image.
function inPixels(box: Fractions, size: Viewport) {
  const left = Math.round(box.left * size.width);
  const top = Math.round(box.top * size.height);
  const right = Math.round((box.left + box.width) * size.width);
  const bottom = Math.round((box.top + box.height) * size.height);
  return {
    left,
    top,
    width: Math.max(1, Math.min(size.width, right) - left),
    height: Math.max(1, Math.min(size.height, bottom) - top)
  };
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

// A dataset's references resolved with the pins saved so far, against the
// Astia given. `sizeOf` tells a Box past its Image's edges; without it,
// none is.
function openScans({
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

  // Why a Mark or Match can't be saved at the target, if it can't: the
  // Volume's label otherwise.
  async function refusal(
    ref: ChurchBookRef,
    target: MarkTarget,
    sizeOfTarget: ImageSizeOf
  ): Promise<{ volume: string } | { rejected: string }> {
    const volume = (await parishVolumes(astia, ref.parish)).find(
      (v) => v.id === target.volumeId
    );
    if (volume === undefined) {
      return { rejected: "That Volume isn't in this parish's church books." };
    }
    const boxed = await boxProblem(target, sizeOfTarget);
    if (boxed !== null) return { rejected: boxed };
    if (await onOldFilming(target.volumeId)) return { rejected: OLD_FILMING };
    const { image } = target;
    if (image !== undefined) {
      const count = (await astia.volumeImages(target.volumeId)).length;
      if (!Number.isInteger(image) || image < 1 || image > count) {
        return { rejected: `The volume has images 1–${count}.` };
      }
    }
    return { volume: volume.label };
  }

  async function linkedVolumes(ref: ChurchBookRef) {
    const matched = await resolveChurchBookRef(astia, ref, await byBook(pins));
    const links = 'links' in matched ? matched.links : [];
    return new Set(links.map((l) => l.volumeId));
  }

  return {
    resolveRef,

    // What resolution reads: the folder's facts about Volumes with the
    // dataset's Marks and Matches read over them.
    snapshot: async () => await pins.snapshot(),

    // The dataset's Marks and Matches as the pins they're kept as, and its
    // Rejections.
    marked: () => pins.marked(),

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
      const checked = await refusal(ref, target, sizeOf);
      if ('rejected' in checked) return checked;
      const linked = (await linkedVolumes(ref)).has(target.volumeId);
      await pins.recordMark(ref, target, { volume: checked.volume, linked });
      return await resolveRef(ref);
    },

    // Saves a Match the vision model confirmed, its Box in fractions of the
    // Image, where a Mark could be saved. Not saved where it was taken back
    // by hand. A dry run checks it and saves nothing.
    async saveMatch(
      ref: ChurchBookRef,
      match: Match,
      { dryRun = false } = {}
    ): Promise<{ saved: boolean } | { rejected: string }> {
      const { volumeId, image } = match;
      const size = await sizeOf({ volumeId, image });
      if (size === null) {
        throw new Error(`No size for Image ${image} of Volume ${volumeId}`);
      }
      const box = inPixels(match.box, size);
      const checked = await refusal(
        ref,
        { volumeId, image, box },
        async () => await Promise.resolve(size)
      );
      if ('rejected' in checked) return checked;
      if (dryRun) return { saved: !(await pins.rejects(ref, match)) };
      const saved = await pins.recordMatch(ref, {
        volumeId,
        volume: checked.volume,
        image,
        onCitedPage: match.onCitedPage,
        box
      });
      return { saved };
    },

    // Whether a Match at `at` was taken back by hand.
    isRejected: async (ref: ChurchBookRef, at: BoxAt) =>
      await pins.rejects(ref, at),

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
    // of the filming `fileId` is of (the one listed now if not given), and
    // the Image's file id; or why it can't be. The Volume must be in one of
    // the `parishes`.
    async imageToCite(
      at: { volumeId: string; image: number; fileId?: string; box: Box },
      parishes: Array<string | null>
    ): Promise<{ volume: string; fileId: string } | { rejected: string }> {
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
      const fileId = files[image - 1]!;
      if (at.fileId !== undefined && fileId !== at.fileId) {
        return { rejected: "That isn't the Image's file in Astia." };
      }
      if (!onImage(at.box, await sizeOf({ volumeId, image }))) {
        return { rejected: OFF_IMAGE };
      }
      return { volume: volume.label, fileId };
    },

    // Takes back the reference's Box at `at`, and gives its links as they
    // now resolve: its estimate, or a pin left without a Box.
    async discardRef(ref: ChurchBookRef, at: BoxAt) {
      if (await onOldFilming(at.volumeId)) return { rejected: OLD_FILMING };
      if (!(await pins.recordDiscard(ref, at))) {
        return { rejected: 'There is no box there to discard.' };
      }
      return await resolveRef(ref);
    },

    // Whether the Image's file was replaced by a Re-scan: the Volume's list
    // kept now gives the Image another file. Asks Astia nothing, so a
    // Volume whose list isn't kept says no.
    async replaced(at: { volumeId: string; image: number; fileId: string }) {
      const files = await astia.cachedImages(at.volumeId);
      return files !== null && leavesOut({ volumeId: at.volumeId, files }, at);
    }
  };
}

export type Scans = ReturnType<typeof openScans>;

// A data folder's scans: its Page pins and Record ranges, read and kept
// once for every dataset, over `base` (the shipped pins unless given).
export function openScanFolder(
  root: string,
  options: { astia: Astia; base?: Pins['volumes'] }
) {
  const { astia } = options;
  const facts = openVolumeFacts(root, options);

  function pinsOf(db: Database) {
    return openPins(facts, openMarks(db));
  }

  return {
    // A dataset's Scans, resolving with its Marks and Matches.
    scans: (db: Database, { sizeOf }: { sizeOf?: ImageSizeOf } = {}) =>
      openScans({ pins: pinsOf(db), astia, sizeOf }),

    // The pins on Astia's Images: the folder's, and each dataset's Marks
    // and Matches, which a switch to a new filming leaves out alike.
    async kept(dbs: Database[]) {
      const { shipped, local } = await facts.kept();
      const marked = dbs.map((db) => pinsOf(db).marked());
      return { shipped, local: [local, ...marked] };
    }
  };
}

export type ScanFolder = ReturnType<typeof openScanFolder>;
