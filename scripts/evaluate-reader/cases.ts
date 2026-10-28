// What the evaluation asks, and how its answers are scored. The questions
// come from what's known by hand: Page pins give the Page numbers on their
// Images, Reference pins of index references the dates on theirs and the
// entry there, and Record pins the person on theirs. Each person is asked
// about on their own Image, and a decoy, someone recorded elsewhere, on the
// same Image: a Reader confirming decoys can't be trusted to save matches.

import type { ImageRef } from '@/server/citations/astia/astia';
import type { Pins } from '@/server/citations/myheritage/pins/locate';
import type { ChurchBookRef } from '@/server/citations/myheritage/record';

import type { EntryTally, Tally } from '../vision/gate';
import { dayRange, personOf } from '../vision/matcher';
import { confirms } from '../vision/reader';
import type { Person, Reader } from '../vision/reader';

interface PageCase {
  at: ImageRef;
  pages: number[];
}

interface DateCase {
  at: ImageRef;
  date: string;
}

interface EntryCase {
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

// Page pins whose number is written as cited; one with a note was misread
// by the source, so what's written differs.
export function pageCases(volumes: Pins['volumes'], limit = Infinity) {
  const cases = Object.entries(volumes).flatMap(([volumeId, v]) =>
    v.pages
      .filter((p) => isHand(p) && p.note === undefined && p.pages.length > 0)
      .map((p) => ({ at: { volumeId, image: p.image }, pages: p.pages }))
  );
  return spread(cases, limit);
}

// Baptism and marriage index references pinned by hand: the cited date is
// on the Image each was pinned to. `refs` holds the dataset's references by
// record URL.
export function dateCases(
  references: Pins['references'],
  refs: Map<string, ChurchBookRef>,
  limit = Infinity
) {
  const cases = Object.entries(references).flatMap(([url, p]) => {
    const ref = refs.get(url);
    const indexed = ref?.kind === 'kastetut' || ref?.kind === 'vihityt';
    const { image } = p;
    if (!isHand(p) || image === undefined || !indexed || ref.date === null) {
      return [];
    }
    return [{ at: { volumeId: p.volumeId, image }, date: ref.date }];
  });
  return spread(cases, limit);
}

// The parish a Volume's title starts with ("Haukivuori I Aa:1 …").
function parishOf(volumes: Pins['volumes'], volumeId: string) {
  return volumes[volumeId]?.title?.split(' ')[0] ?? volumeId;
}

// For each hand Record pin whose principal is known, the person on their
// Image, and a decoy there: the next such person from another parish's
// books. A decoy from the same Volume may well be written on the Image too,
// as families recur page after page; one from another parish can't be, yet
// bears the same kind of name. Each is asked about as the pass would ask,
// with their household.
export function entryCases(
  volumes: Pins['volumes'],
  people: Map<number, Person>,
  limit = Infinity
) {
  const known = Object.entries(volumes).flatMap(([volumeId, v]) =>
    (v.records ?? [])
      .filter((p) => isHand(p) && people.has(p.record))
      .map((p) => ({
        at: { volumeId, image: p.image },
        parish: parishOf(volumes, volumeId),
        person: people.get(p.record)!
      }))
  );
  const cases = known.map((k, i) => {
    const pair: EntryCase[] = [{ at: k.at, person: k.person, there: true }];
    const rest = [...known.slice(i + 1), ...known.slice(0, i)];
    const decoy = rest.find((o) => o.parish !== k.parish);
    if (decoy !== undefined) {
      pair.push({ at: k.at, person: decoy.person, there: false });
    }
    return pair;
  });
  return spread(cases, limit).flat();
}

// Images apart beyond which an entry can't be the other's continuation or
// Retake.
const APART = 2;

// For each index reference pinned by hand, its entry on its Image, and a
// decoy there: the next such reference in the Volume pinned at least two
// Images away, else one from another Volume. One from the same Volume is
// the hard case: a family recurs there, in the same hand, months apart,
// and only the date written tells their entries apart. `refs` holds the
// dataset's references by record URL.
export function indexEntryCases(
  references: Pins['references'],
  refs: Map<string, ChurchBookRef>,
  limit = Infinity
) {
  const known = Object.entries(references).flatMap(([url, p]) => {
    const ref = refs.get(url);
    const indexed = ref?.kind === 'kastetut' || ref?.kind === 'vihityt';
    const { image } = p;
    if (!isHand(p) || image === undefined || !indexed || ref.name === null) {
      return [];
    }
    const at = { volumeId: p.volumeId, image };
    return [{ at, person: personOf(ref, ref.name) }];
  });
  const cases = known.map((k, i) => {
    const pair: EntryCase[] = [{ at: k.at, person: k.person, there: true }];
    const rest = [...known.slice(i + 1), ...known.slice(0, i)];
    const decoy =
      rest.find(
        (o) =>
          o.at.volumeId === k.at.volumeId &&
          Math.abs(o.at.image - k.at.image) >= APART
      ) ?? rest.find((o) => o.at.volumeId !== k.at.volumeId);
    if (decoy !== undefined) {
      pair.push({ at: k.at, person: decoy.person, there: false });
    }
    return pair;
  });
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
    else if (sameList([...new Set(reading.pages)], c.pages)) tally.exact += 1;
    else tally.wrong += 1;
  }
  return tally;
}

// Exact when the dates read cover the cited one.
export async function scoreDates(reader: Reader, cases: DateCase[]) {
  const tally = emptyTally();
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const reading = await reader.dates(c.at);
    const cited = dayRange(c.date);
    tally.questions += 1;
    if ('unreadable' in reading) tally.unreadable += 1;
    else if (reading.earliest <= cited.to && cited.from <= reading.latest) {
      tally.exact += 1;
    } else tally.wrong += 1;
  }
  return tally;
}

// A "found", with whether the person is really there.
export interface Confirmation {
  there: boolean;
  confidence: number;
}

export async function scoreEntries(
  reader: Reader,
  cases: EntryCase[],
  found: Confirmation[] = []
) {
  const tally: EntryTally = {
    ...emptyTally(),
    decoys: 0,
    falseConfirmations: 0
  };
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const reading = await reader.findEntry(c.at, c.person);
    const confirmed = confirms(c.person, reading);
    if (confirmed && !('unreadable' in reading)) {
      found.push({ there: c.there, confidence: reading.confidence });
    }
    tally.questions += 1;
    if (!c.there) tally.decoys += 1;
    if ('unreadable' in reading) {
      tally.unreadable += 1;
    } else if (confirmed === c.there) {
      tally.exact += 1;
    } else {
      tally.wrong += 1;
      if (!c.there) tally.falseConfirmations += 1;
    }
  }
  return tally;
}
