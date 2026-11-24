// A dataset's pins: the data folder's Volume facts, with the dataset's
// Marks and Matches read over them, and the saving of them.
//
// A dataset's Marks and Matches are in its citations (marks.ts,
// ADR-0013). Resolution (locate.ts) reads each as a Reference pin of every
// reference citing its record, and, on an Image, as a Record pin, which
// extends its Volume's Record range for that dataset only. A Mark on an
// Image of a Volume the reference links also saves its cited page there
// as a Page pin, one of the Volume facts.
//
// A Mark always wins: a Match never replaces one, and a Mark replaces a
// Match. A Discard takes a Box back; a Match taken back is only undone,
// and nothing of it is kept.

import type { Box } from '@/common/types';

import type { CitationLink } from '../../annotations';
import type {
  BoxAt,
  DiscardDone,
  MarkDone,
  MarkTarget
} from '../../references';
import { fileOf, isHand, leavesOut } from '../../volume-facts';
import type {
  Filming,
  LocalPins,
  Pins,
  RecordPin,
  ReferencePin,
  VolumeFacts,
  VolumePins
} from '../../volume-facts';
import { markKey } from '../record';
import type { ChurchBookRef } from '../record';
import type { Marks } from './marks';
import { contains, extendedRange } from './ranges';

// ---------------------------------------------------------------- marks as pins

function pinFields(link: CitationLink) {
  const { image, box, fileId, by } = link;
  return {
    ...(image === undefined ? {} : { image }),
    by,
    ...(box === undefined ? {} : { box }),
    ...(fileId === undefined ? {} : { fileId })
  };
}

function referencePinOf(link: CitationLink): ReferencePin {
  return { volumeId: link.volumeId, volume: link.volume, ...pinFields(link) };
}

// The Record pins the Marks on Images give, by Volume: one per record.
function recordPinsOf(marked: ReturnType<Marks['linked']>) {
  const seen = new Set<number>();
  const out: Array<{ volumeId: string; title: string; pin: RecordPin }> = [];
  for (const { recordId, link } of marked) {
    if (recordId === null || link.image === undefined || seen.has(recordId)) {
      continue;
    }
    seen.add(recordId);
    const { image, ...rest } = pinFields(link);
    out.push({
      volumeId: link.volumeId,
      title: link.volume,
      pin: { record: recordId, image: image!, ...rest }
    });
  }
  return out;
}

// The Volumes' facts with the Marks read over them: each Mark on an Image a
// Record pin extending its Volume's Record range, and every marked
// citation's reference a Reference pin.
function withMarks(volumes: Pins['volumes'], marks: Marks): Pins {
  const marked = marks.linked();
  const out = { ...volumes };
  for (const { volumeId, title, pin } of recordPinsOf(marked)) {
    const volume: VolumePins = { ...(out[volumeId] ?? { title, pages: [] }) };
    volume.records = [...(volume.records ?? []), pin];
    out[volumeId] = volume;
    const range = extendedRange(out, volumeId, pin.record);
    if (range !== null) {
      volume.ranges = [
        ...(volume.ranges ?? []).filter((r) => !contains(range, r)),
        range
      ];
    }
  }
  const references: Pins['references'] = {};
  for (const { url, link } of marked) {
    references[url] ??= referencePinOf(link);
  }
  return { volumes: out, references };
}

// ---------------------------------------------------------------- the module

export type { BoxAt, DiscardDone, MarkDone, MarkTarget };

// A Match as saved: its Box in pixels of the full-size Image.
interface PixelMatch {
  volumeId: string;
  volume: string;
  image: number;
  box: Box;
}

// The Link's Box, when it's on the Image of the filming now: a Mark there
// keeps it, as confirming a Match does.
function boxThere(
  link: CitationLink | null,
  filming: Filming,
  image: number
): { box?: Box } {
  if (link?.volumeId !== filming.volumeId || link.image !== image) return {};
  if (link.box === undefined || leavesOut(filming, link)) return {};
  return { box: link.box };
}

// A dataset's pins: the data folder's facts about Volumes, and the
// dataset's Marks.
export function openPins(facts: VolumeFacts, marks: Marks) {
  return {
    // What resolution reads: the facts about Volumes with the Marks read
    // over them.
    async snapshot(): Promise<Pins> {
      return withMarks(await facts.volumes(), marks);
    },

    // Changes whenever the local file or the Marks do.
    async stamp() {
      return `${await facts.stamp()}/${marks.stamp()}`;
    },

    // The dataset's Marks as the pins they are kept as: Record pins,
    // Reference pins for references with no Record number. Rejections are
    // no longer kept (ADR-0029).
    marked(): LocalPins {
      const linked = marks.linked();
      const volumes: Pins['volumes'] = {};
      for (const { volumeId, title, pin } of recordPinsOf(linked)) {
        const volume = volumes[volumeId] ?? { title, pages: [] };
        volumes[volumeId] = {
          ...volume,
          records: [...(volume.records ?? []), pin]
        };
      }
      const references = Object.fromEntries(
        linked
          .filter((m) => m.recordId === null)
          .map((m) => [m.url, referencePinOf(m.link)])
      );
      return { volumes, references };
    },

    // A Mark: the reference's record is on the Image, or in the Volume when
    // the target gives none. `volume` is the Volume's label; `linked`,
    // whether the reference links that Volume by the Book it cites.
    //
    // Only a Volume is the record's own Link, and nothing its neighbours
    // count from. On an Image, a cited page found in a Volume the reference
    // already links is also a Page pin, which moves the Volume's other
    // references near it too; a reference with neither a Record number nor
    // a Box then needs no Link of its own. Says what it did.
    async recordMark(
      ref: ChurchBookRef,
      target: MarkTarget,
      where: { volume: string; linked: boolean }
    ): Promise<MarkDone> {
      const key = markKey(ref);
      const { volumeId, image } = target;
      const { volume, linked } = where;
      const before = marks.linkOf(key);
      const citations = marks.countOf(key);
      if (image === undefined) {
        marks.change(() => {
          marks.write(key, { volumeId, volume, by: 'hand' });
        });
        return {
          at: 'volume',
          volume,
          confirmed: false,
          citations,
          pagePin: null
        };
      }
      const confirmed =
        before !== null &&
        !isHand(before) &&
        before.volumeId === volumeId &&
        before.image === image;
      const filming = await facts.filmingOf(volumeId);
      const pagePinned = ref.page !== null && linked;
      if (pagePinned) {
        await facts.savePagePin(
          filming,
          { page: ref.page!, kind: ref.kind },
          { volume, image, by: 'hand' }
        );
      }
      const entry = marks.change(() => {
        const drawn = target.box;
        const box =
          drawn === undefined
            ? boxThere(marks.linkOf(key), filming, image)
            : drawn === null
              ? {}
              : { box: drawn };
        const own = !pagePinned || ref.recordId !== null || 'box' in box;
        const link: CitationLink = {
          volumeId,
          volume,
          image,
          ...fileOf(filming, image),
          ...box,
          by: 'hand'
        };
        marks.write(key, own ? link : null);
        return 'box' in box;
      });
      return {
        at: entry ? 'entry' : 'image',
        volume,
        confirmed,
        citations,
        pagePin: pagePinned ? ref.page : null
      };
    },

    // A match the vision model confirmed. A Mark is never replaced.
    async recordMatch(ref: ChurchBookRef, match: PixelMatch) {
      const key = markKey(ref);
      const { volumeId, volume, image, box } = match;
      const filming = await facts.filmingOf(volumeId);
      marks.change(() => {
        const known = marks.linkOf(key);
        const weighed = known !== null && !leavesOut(filming, known);
        if (!(weighed && isHand(known))) {
          marks.write(key, {
            volumeId,
            volume,
            image,
            ...fileOf(filming, image),
            box,
            by: 'vision'
          });
        }
      });
    },

    // Takes back the Box the reference's Link shows at `at`, a Mark's or a
    // Match's. Page pins and Record ranges stay, as facts about the
    // Volume. A Match taken back is only undone. What it did, or null
    // when there was no Box there to take back.
    async recordDiscard(
      ref: ChurchBookRef,
      at: BoxAt
    ): Promise<DiscardDone | null> {
      const key = markKey(ref);
      return await Promise.resolve(
        marks.change(() => {
          const link = marks.linkOf(key);
          if (
            link?.volumeId !== at.volumeId ||
            link.image !== at.image ||
            link.box === undefined
          ) {
            return null;
          }
          marks.write(key, null);
          return { volume: link.volume, match: !isHand(link) };
        })
      );
    }
  };
}

export type PinStore = ReturnType<typeof openPins>;
