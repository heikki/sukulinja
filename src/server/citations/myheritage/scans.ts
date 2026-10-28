// Astia Links for MyHeritage's Church-book references, resolved on demand,
// and every save of where one is: a Mark, a Match or a Discard. Opened by
// data folder, whose Page pins and Record ranges every dataset shares, then
// by dataset, whose Marks and Matches are in its citations.

import type { Database } from 'bun:sqlite';

import type {
  Link,
  LinkResolution,
  VolumeChoice,
  VolumeChoices,
  Years
} from '@/common/types';

import { archiveOf, parishArchive, parishVolumes } from '../astia/archives';
import { AstiaError } from '../astia/astia';
import type { Astia, Volume } from '../astia/astia';
import type { Viewport } from '../astia/jpeg';
import {
  OFF_IMAGE,
  OLD_FILMING,
  onImage,
  onOldFilming,
  unknownSize
} from '../images';
import type { ImageSizeOf } from '../images';
import { resolveChurchBookRef } from './pins/locate';
import type { Pins } from './pins/locate';
import { openMarks } from './pins/marks';
import { openPins, openVolumeFacts } from './pins/pins';
import type { BoxAt, MarkTarget, PinStore } from './pins/pins';
import type { ChurchBookRef } from './record';

// The pins resolution reads, but no Reference pins: a reference's links by
// the Book it cites, not by where it was pinned before.
async function byBook(pins: PinStore) {
  return { volumes: (await pins.snapshot()).volumes, references: {} };
}

// What the vision pass (scripts/vision) is given and gives back: the
// Volumes to search, and the entry it confirmed.

// A Volume the existing resolution offers for the reference, with its
// number of Images, the years its label gives, and the Image it links when
// it knows one.
export interface Candidate {
  volumeId: string;
  volume: string;
  images: number;
  years: Years | null;
  start: number | null;
}

// Where an entry is on an Image, in fractions of its width and height:
// what a reading gives, whatever size the model read the Image at. A Box
// saved is in pixels of the full-size Image (see Box).
export interface Fractions {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Where the vision model confirmed the entry.
export interface Match {
  confirmed: true;
  volumeId: string;
  volume: string;
  image: number;
  // Whether page search read the cited Page number on this very Image,
  // so it can stand as a Page pin.
  onCitedPage: boolean;
  // Where on the Image the entry is: a Match saves only with one.
  box: Fractions;
}

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
    if (await onOldFilming(astia, target.volumeId)) {
      return { rejected: OLD_FILMING };
    }
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
        astia,
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

    // Takes back the reference's Box at `at`, and gives its links as they
    // now resolve: its estimate, or a pin left without a Box.
    async discardRef(ref: ChurchBookRef, at: BoxAt) {
      if (await onOldFilming(astia, at.volumeId)) {
        return { rejected: OLD_FILMING };
      }
      if (!(await pins.recordDiscard(ref, at))) {
        return { rejected: 'There is no box there to discard.' };
      }
      return await resolveRef(ref);
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
