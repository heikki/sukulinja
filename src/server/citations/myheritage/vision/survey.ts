// A page survey of a Volume: how its Page numbers go, read by the vision
// model on as few Images as it takes (ADR-0032). It reads a few Images
// spread over the Volume, then, between any two readings that don't agree
// with the book's pace (one number an Image a spread, two a page), the
// Image halfway, until every two neighbouring readings agree or have no
// Image left to read between them: where the numbering starts over, the
// survey closes in on the place. Each reading is then a Page pin, by the vision model,
// which never replaces a hand one; it counts every estimate in the Volume.
//
// Readings are cached as any other (reader.ts), so a survey run again, or
// one reaching an Image a search already read, asks nothing new.

import type { PagesReading, Reader } from './reader';

// Readings a survey may make in one Volume.
export const MAX_SURVEY_READS = 30;
// How far a reading may stray from where its neighbour's pace puts it, in
// Page numbers, and still agree: a leaf left unnumbered, a number skipped.
const SLACK = 2;
// Where the first readings go, in fractions of the Volume: not its very
// first Images, which are covers and front matter.
const OPENING = [0.05, 0.5, 0.95];
// Images tried beside an unreadable one before leaving the place.
const BESIDE = [1, -1, 2, -2];

export interface PageReading {
  image: number;
  pages: number[];
}

export interface Survey {
  // What was read, by Image.
  readings: PageReading[];
  // Questions asked, including the unreadable ones.
  reads: number;
  // Whether every two neighbouring readings agree: false when the survey
  // ran out of reads first, or read nothing.
  settled: boolean;
}

function first(r: PageReading) {
  return Math.min(...r.pages);
}

// Whether `b` is numbered where `a`'s pace puts it.
function agree(a: PageReading, b: PageReading) {
  const expected = first(a) + (b.image - a.image) * a.pages.length;
  return Math.abs(first(b) - expected) <= SLACK * a.pages.length;
}

// The untried Image nearest halfway between `a` and `b`, if any.
function between(a: PageReading, b: PageReading, tried: Set<number>) {
  const mid = (a.image + b.image) / 2;
  const inner = Array.from(
    { length: b.image - a.image - 1 },
    (_, i) => a.image + 1 + i
  ).filter((n) => !tried.has(n));
  return inner.toSorted((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0];
}

// An Image to read between each two neighbouring readings that don't
// agree, while one is left untried there.
function gaps(readings: PageReading[], tried: Set<number>) {
  const sorted = readings.toSorted((a, b) => a.image - b.image);
  return sorted.slice(1).flatMap((b, i) => {
    const a = sorted[i]!;
    const next = agree(a, b) ? undefined : between(a, b, tried);
    return next === undefined ? [] : [next];
  });
}

export async function surveyVolume(
  reader: Pick<Reader, 'pageNumbers'>,
  volume: { volumeId: string; images: number }
): Promise<Survey> {
  const { volumeId, images } = volume;
  const readings: PageReading[] = [];
  const tried = new Set<number>();
  let reads = 0;

  // Reads the Image, or one beside it where it's unreadable.
  async function readNear(image: number) {
    for (const d of [0, ...BESIDE]) {
      const at = image + d;
      if (at < 1 || at > images || tried.has(at)) continue;
      if (reads >= MAX_SURVEY_READS) return;
      tried.add(at);
      reads += 1;
      // eslint-disable-next-line no-await-in-loop -- one reading at a time, paced
      const reading: PagesReading = await reader.pageNumbers({
        volumeId,
        image: at
      });
      if (!('unreadable' in reading) && reading.pages.length > 0) {
        // A spread's number written on both pages counts once.
        readings.push({ image: at, pages: [...new Set(reading.pages)] });
        return;
      }
    }
  }

  const opening = [
    ...new Set(OPENING.map((f) => Math.max(1, Math.round(f * images))))
  ];
  for (const image of opening) {
    // eslint-disable-next-line no-await-in-loop -- one reading at a time
    await readNear(image);
  }
  for (;;) {
    const next = gaps(readings, tried);
    if (next.length === 0 || reads >= MAX_SURVEY_READS) break;
    for (const image of next) {
      // eslint-disable-next-line no-await-in-loop -- one reading at a time
      await readNear(image);
    }
  }
  const settled = readings.length > 0 && gaps(readings, tried).length === 0;
  return {
    readings: readings.toSorted((a, b) => a.image - b.image),
    reads,
    settled
  };
}
