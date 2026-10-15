// What the evaluation asks, and how its answers are scored. The questions
// come from what's known by hand: Anchors give the Page numbers on their
// Images, and Seen records the person on theirs. Each person is asked about
// on their own Image, and a decoy, someone recorded elsewhere in the
// Volume, on the same Image: a Reader confirming decoys can't be trusted
// to save matches.

import type { Anchors } from '@server/citation-scans/locate';
import type { ImageRef, Person, Reader } from '@server/citation-scans/reader';

import type { EntryTally, Tally } from '../vision/gate';

export interface PageCase {
  at: ImageRef;
  pages: number[];
}

export interface EntryCase {
  at: ImageRef;
  person: Person;
  // Whether the person is on the Image: false for a decoy.
  there: boolean;
}

function isHand(entry: { by?: string }) {
  return entry.by !== 'vision';
}

// Every `n`-th of the list, so a limited run still spans the Volumes.
function spread<T>(list: T[], limit: number) {
  if (list.length <= limit) return list;
  const step = list.length / limit;
  return Array.from({ length: limit }, (_, i) => list[Math.floor(i * step)]!);
}

// Anchors whose number is written as cited; one with a note was misread by
// the source, so what's written differs.
export function pageCases(anchors: Anchors, limit = Infinity) {
  const cases = Object.entries(anchors).flatMap(([volumeId, v]) =>
    v.anchors
      .filter((a) => isHand(a) && a.note === undefined && a.pages.length > 0)
      .map((a) => ({ at: { volumeId, image: a.image }, pages: a.pages }))
  );
  return spread(cases, limit);
}

// Records far enough apart in number to be on different Frames.
const DECOY_DISTANCE = 200;

// For each hand Seen record whose principal is named, the person on their
// Image, and a decoy there: another Seen record of the Volume on another
// Image, or failing that a record numbered well away from it in the
// Volume's Record range.
export function entryCases(
  anchors: Anchors,
  names: Map<number, string>,
  limit = Infinity
) {
  const cases: EntryCase[][] = [];
  for (const [volumeId, v] of Object.entries(anchors)) {
    const seen = (v.seen ?? []).filter((s) => isHand(s) && names.has(s.record));
    const inRange = [...names.keys()].filter((record) =>
      (v.records ?? []).some((r) => r.from <= record && record <= r.to)
    );
    for (const s of seen) {
      const name = names.get(s.record)!;
      const other =
        seen.find((o) => o.image !== s.image && names.get(o.record) !== name)
          ?.record ??
        inRange.find(
          (r) =>
            Math.abs(r - s.record) >= DECOY_DISTANCE && names.get(r) !== name
        );
      const at = { volumeId, image: s.image };
      const pair: EntryCase[] = [{ at, person: { name }, there: true }];
      if (other !== undefined) {
        pair.push({ at, person: { name: names.get(other)! }, there: false });
      }
      cases.push(pair);
    }
  }
  return spread(cases, limit).flat();
}

function emptyTally(): Tally {
  return { questions: 0, exact: 0, wrong: 0, unreadable: 0 };
}

function sameList(a: number[], b: number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function scorePages(reader: Reader, cases: PageCase[]) {
  const tally = emptyTally();
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const reading = await reader.pageNumbers(c.at);
    tally.questions += 1;
    if ('unreadable' in reading) tally.unreadable += 1;
    else if (sameList(reading.pages, c.pages)) tally.exact += 1;
    else tally.wrong += 1;
  }
  return tally;
}

export async function scoreEntries(reader: Reader, cases: EntryCase[]) {
  const tally: EntryTally = {
    ...emptyTally(),
    decoys: 0,
    falseConfirmations: 0
  };
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const reading = await reader.findEntry(c.at, c.person);
    tally.questions += 1;
    if (!c.there) tally.decoys += 1;
    if ('unreadable' in reading) {
      tally.unreadable += 1;
    } else if (reading.found === c.there) {
      tally.exact += 1;
    } else {
      tally.wrong += 1;
      if (!c.there) tally.falseConfirmations += 1;
    }
  }
  return tally;
}
