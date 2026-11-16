// A page survey of a Volume: how its Page numbers go, read by the vision
// model on as few Images as it takes (ADR-0032). It reads Images spread
// over the Volume, no more than OPENING_GAP apart, then, between any two
// readings that don't agree exactly with the book's pace (one number an
// Image a spread, two a page), the Image halfway, until every two
// neighbouring readings agree or have no Image left to read between them:
// a leaf missing or inserted, or the numbering starting over, is closed in
// on to the Image. Each reading is then a Page pin, by the vision model,
// which never replaces a hand one; it counts every estimate in the Volume.
//
// It surveys the whole Volume; given the pages its references cite, it
// closes in first on the disagreements that could move one of them, so
// that where it runs out of readings, it's where none is cited. Up to
// READ_AT_ONCE Images are read at a time.
//
// Each Image is read at its top left corner: one number, the spread's or
// its left page's; how the readings step tells which (paceOf).
//
// An Image may carry another numbering beside the book's, such as a
// printed form's own numbers in the other corner, and the model may give
// either or both: of the numbers read on an Image, the survey takes those
// that agree with its neighbours. A reading agreeing with neither, where
// they agree with each other across it, is a misreading, left out.
//
// Readings are cached as any other (reader.ts), so a survey run again, or
// one reaching an Image a search already read, asks nothing new.

import type { PagesReading, Reader } from './reader';

// Readings a survey may make in one Volume.
export const MAX_SURVEY_READS = 50;
// Where the first readings go: from 5% into the Volume to 95%, past its
// covers and front matter, at most this many Images apart.
const OPENING_GAP = 20;
// Images read at a time.
const READ_AT_ONCE = 4;
// Images tried beside an unreadable one before leaving the place.
const BESIDE = [1, -1, 2, -2];

export interface PageReading {
  image: number;
  pages: number[];
  // Only a printed form's numbers read on it.
  printed?: true;
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

// Whether `b` is numbered just where `a`'s pace puts it.
function agree(a: PageReading, b: PageReading) {
  const perImage = Math.max(a.pages.length, b.pages.length);
  return first(b) === first(a) + (b.image - a.image) * perImage;
}

// What an Image's numbers could be of the book's numbering: all of them,
// each alone, or two following each other (a page-numbered spread).
function choices(r: PageReading): PageReading[] {
  const sorted = r.pages.toSorted((a, b) => a - b);
  const pairs = sorted.flatMap((p, i) =>
    sorted[i + 1] === p + 1 ? [[p, p + 1]] : []
  );
  const all = [sorted, ...sorted.map((p) => [p]), ...pairs];
  const seen = new Set<string>();
  return all.flatMap((pages) => {
    const key = pages.join(',');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ image: r.image, pages }];
  });
}

// Where a choice puts the numbering: its pace, and the number it would
// give Image 0. Readings of one numbering share it, until a leaf goes
// missing or the numbering starts over; another numbering's drift.
function lineOf(c: PageReading) {
  const pace = c.pages.length;
  return `${pace} ${first(c) - c.image * pace}`;
}

// Readings either side of the one weighed, for its choice.
const NEAR = 4;

// How many numbers the book gives an Image: 1 numbering spreads, 2
// numbering pages. Read from the top left corner alone, an Image gives
// its left page's number, so the pace is told by how two readings near
// each other step: the one more of them follow.
function paceOf(readings: PageReading[]) {
  const sorted = readings.toSorted((a, b) => a.image - b.image);
  let votes = 0;
  for (const [i, b] of sorted.slice(1).entries()) {
    const a = sorted[i]!;
    if (a.pages.length === 2 || b.pages.length === 2) votes += 1;
    const step = (first(b) - first(a)) / (b.image - a.image);
    if (step === 2) votes += 1;
    if (step === 1) votes -= 1;
  }
  return votes > 0 ? 2 : 1;
}

// The readings at the book's pace: a page-numbered book's left page read
// alone, with its right page following.
function atPace(readings: PageReading[]) {
  if (paceOf(readings) === 1) return readings;
  return readings.map((r) =>
    r.pages.length === 1 ? { ...r, pages: [r.pages[0]!, r.pages[0]! + 1] } : r
  );
}

// A Volume numbered by hand on enough of its Images: the readings of a
// printed form's numbers, where the handwritten were missed, are left out.
const BY_HAND_SHARE = 0.25;

function byHand(readings: PageReading[]) {
  const hand = readings.filter((r) => r.printed !== true);
  const numbered =
    hand.length >= 3 && hand.length >= BY_HAND_SHARE * readings.length;
  return numbered ? hand : readings;
}

// Each reading, in Image order, as the choice of its numbers most of the
// readings near it share the line of (all it read, where none does), less
// the misreadings.
function settle(readings: PageReading[]) {
  const sorted = atPace(byHand(readings)).toSorted((a, b) => a.image - b.image);
  const lines = sorted.map((r) => new Set(choices(r).map(lineOf)));
  const chosen = sorted.map((r, i) => {
    const near = lines.filter((_, k) => k !== i && Math.abs(k - i) <= NEAR);
    const scored = choices(r).map((c) => {
      const line = lineOf(c);
      return { c, score: near.filter((l) => l.has(line)).length };
    });
    const best = Math.max(...scored.map((x) => x.score));
    return best === 0 ? r : scored.find((x) => x.score === best)!.c;
  });
  return chosen.filter((r, i) => {
    const before = chosen[i - 1];
    const after = chosen[i + 1];
    if (before === undefined || after === undefined) return true;
    return agree(before, r) || agree(r, after) || !agree(before, after);
  });
}

// The Images first read: evenly from 5% into the Volume to 95%, at most
// OPENING_GAP apart.
function openingImages(images: number) {
  const from = Math.max(1, Math.round(0.05 * images));
  const to = Math.max(from, Math.round(0.95 * images));
  const steps = Math.max(1, Math.ceil((to - from) / OPENING_GAP));
  return [
    ...new Set(
      Array.from({ length: steps + 1 }, (_, i) =>
        Math.round(from + ((to - from) * i) / steps)
      )
    )
  ];
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

// Whether a cited page could lie between the two readings: any, with no
// pages given, or where the numbering goes back between them.
function holdsCited(a: PageReading, b: PageReading, cited: number[] | null) {
  if (cited === null || first(b) < first(a)) return true;
  const last = Math.max(...b.pages);
  return cited.some((p) => p >= first(a) && p <= last);
}

// An Image to read between each two neighbouring readings that don't
// agree, while one is left untried there: first where a cited page could
// be.
function gaps(
  readings: PageReading[],
  tried: Set<number>,
  cited: number[] | null
) {
  const sorted = settle(readings);
  const found = sorted.slice(1).flatMap((b, i) => {
    const a = sorted[i]!;
    const next = agree(a, b) ? undefined : between(a, b, tried);
    return next === undefined ? [] : [{ next, first: holdsCited(a, b, cited) }];
  });
  return [
    ...found.filter((g) => g.first),
    ...found.filter((g) => !g.first)
  ].map((g) => g.next);
}

// Runs `task` over `items`, `limit` at a time.
async function inTurns<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
) {
  const queue = [...items];
  async function worker() {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      // eslint-disable-next-line no-await-in-loop -- this worker's next in turn
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

// Surveys the Volume; `cited`, the pages its references cite, to close in
// on first, or null.
export async function surveyVolume(
  reader: Pick<Reader, 'pageNumbers'>,
  volume: { volumeId: string; images: number },
  cited: number[] | null = null
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
      // eslint-disable-next-line no-await-in-loop -- beside it only if unreadable
      const reading: PagesReading = await reader.pageNumbers({
        volumeId,
        image: at
      });
      if (!('unreadable' in reading) && reading.pages.length > 0) {
        // A spread's number written on both pages counts once.
        const pages = [...new Set(reading.pages)];
        readings.push(
          reading.printed === true
            ? { image: at, pages, printed: true }
            : { image: at, pages }
        );
        return;
      }
    }
  }

  await inTurns(openingImages(images), READ_AT_ONCE, readNear);
  for (;;) {
    const next = gaps(readings, tried, cited);
    if (next.length === 0 || reads >= MAX_SURVEY_READS) break;
    // eslint-disable-next-line no-await-in-loop -- each round follows the last's readings
    await inTurns(next, READ_AT_ONCE, readNear);
  }
  const settled =
    readings.length > 0 && gaps(readings, tried, cited).length === 0;
  return {
    readings: settle(readings),
    reads,
    settled
  };
}
