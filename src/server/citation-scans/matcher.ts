// Matching a Church-book reference to the exact Image it cites, by asking
// the Reader (see reader.ts) what is written on the scans.
//
// A search lands on an Image; a Confirmation then looks for the person's
// name there, and on the Images around it: an entry may continue onto the
// next Image, sit on a Retake, or be one or two Images off where the
// search misread. Only a find-entry "found" confirms. A reference with
// several candidate Volumes is searched in each, and the one the person is
// found in wins; found in more than one, it stays unconfirmed.
//
// Date search, for baptism and marriage index references: these books run
// in date order, so a binary search over the Volume's Images by the dates
// read on them closes in on the Image whose range covers the cited date.

import type { DatesReading, Person, Reader } from './reader';
import type { ChurchBookRef } from './record';

// A Volume the existing resolution offers for the reference, with its
// number of Images, and the Image it links when it knows one.
export interface Candidate {
  volumeId: string;
  volume: string;
  images: number;
  start: number | null;
}

export type Unconfirmed =
  | 'name not found'
  | 'unreadable'
  | 'did not converge'
  | 'ambiguous'
  | 'no candidate volume'
  | 'no name'
  | 'unsupported';

export type Match =
  | { confirmed: true; volumeId: string; volume: string; image: number }
  | {
      confirmed: false;
      reason: Unconfirmed;
      // Where the search ended, to open the Scan viewer near the entry.
      volumeId?: string;
      volume?: string;
      image?: number;
    };

// Readings a search may make in one Volume before giving up.
const MAX_READS = 24;
// Images tried around an unreadable one before calling the place
// unreadable.
const UNREADABLE_PROBES = 8;
// How far from the landing Image a Confirmation looks.
const WINDOW = 3;

type Landing = { image: number } | { reason: Unconfirmed; image: number };

// ---------------------------------------------------------------- dates

// The days a cited date covers: "1829" is the whole year.
export function dayRange(date: string) {
  return { from: date, to: `${date}${'-99'.repeat((10 - date.length) / 3)}` };
}

// Images to try for `at`, nearest first, within lo–hi.
function probes(at: number, lo: number, hi: number) {
  const out = [at];
  for (let d = 1; out.length < UNREADABLE_PROBES && d <= hi - lo; d++) {
    if (at + d <= hi) out.push(at + d);
    if (at - d >= lo && out.length < UNREADABLE_PROBES) out.push(at - d);
  }
  return out;
}

async function dateSearch(
  reader: Reader,
  c: Candidate,
  date: string
): Promise<Landing> {
  const cited = dayRange(date);
  let lo = 1;
  let hi = c.images;
  let reads = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    let read: { image: number; dates: DatesReading } | null = null;
    for (const image of probes(mid, lo, hi)) {
      reads += 1;
      // eslint-disable-next-line no-await-in-loop -- each probe waits on the last
      const dates = await reader.dates({ volumeId: c.volumeId, image });
      if (!('unreadable' in dates)) {
        read = { image, dates };
        break;
      }
    }
    if (read === null) {
      // Narrowed to a stretch Confirmation looks over anyway.
      if (hi - lo <= 2 * WINDOW) return { image: mid };
      return { reason: 'unreadable', image: mid };
    }
    if (reads >= MAX_READS) {
      return { reason: 'did not converge', image: read.image };
    }
    const { earliest, latest } = read.dates as Exclude<
      DatesReading,
      { unreadable: true }
    >;
    if (cited.to < earliest) hi = read.image - 1;
    else if (cited.from > latest) lo = read.image + 1;
    else return { image: read.image };
  }
  // Between two Images' ranges: the later one, and Confirmation checks the
  // one before.
  return { image: Math.min(Math.max(lo, 1), c.images) };
}

// ---------------------------------------------------------------- confirmation

function around(image: number, images: number) {
  const out = [image];
  for (let d = 1; d <= WINDOW; d++) {
    out.push(image + d, image - d);
  }
  return out.filter((n) => n >= 1 && n <= images);
}

async function confirm(
  reader: Reader,
  c: Candidate,
  landed: number,
  person: Person
): Promise<Landing> {
  let readable = false;
  for (const image of around(landed, c.images)) {
    // eslint-disable-next-line no-await-in-loop -- nearest first, stop when found
    const entry = await reader.findEntry(
      { volumeId: c.volumeId, image },
      person
    );
    if ('unreadable' in entry) continue;
    readable = true;
    if (entry.found) return { image };
  }
  return { reason: readable ? 'name not found' : 'unreadable', image: landed };
}

// ---------------------------------------------------------------- matching

function search(reader: Reader, ref: ChurchBookRef, c: Candidate) {
  const indexed = ref.kind === 'kastetut' || ref.kind === 'vihityt';
  if (indexed && ref.date !== null) return dateSearch(reader, c, ref.date);
  return null;
}

async function matchIn(
  reader: Reader,
  ref: ChurchBookRef,
  c: Candidate,
  person: Person
): Promise<Landing> {
  const searching = search(reader, ref, c);
  if (searching === null) {
    return { reason: 'unsupported', image: c.start ?? 1 };
  }
  const landed = await searching;
  return 'reason' in landed
    ? landed
    : await confirm(reader, c, landed.image, person);
}

interface Outcome {
  c: Candidate;
  landing: Landing;
}

function at({ c, landing }: Outcome) {
  return { volumeId: c.volumeId, volume: c.volume, image: landing.image };
}

function reasonOf({ landing }: Outcome) {
  return 'reason' in landing ? landing.reason : 'unsupported';
}

// When nothing confirms, the outcome most worth a look by hand.
const REVIEW_ORDER: Unconfirmed[] = [
  'name not found',
  'did not converge',
  'unreadable',
  'unsupported'
];

export async function matchRef(
  ref: ChurchBookRef,
  candidates: Candidate[],
  reader: Reader
): Promise<Match> {
  if (candidates.length === 0) {
    return { confirmed: false, reason: 'no candidate volume' };
  }
  if (ref.name === null) {
    return { confirmed: false, reason: 'no name' };
  }
  const person: Person = {
    name: ref.name,
    date: ref.date,
    village: ref.places[0] ?? null
  };
  const outcomes: Outcome[] = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop -- one Volume at a time
    outcomes.push({ c, landing: await matchIn(reader, ref, c, person) });
  }
  const found = outcomes.filter((o) => !('reason' in o.landing));
  if (found.length === 1) return { confirmed: true, ...at(found[0]!) };
  if (found.length > 1) {
    return { confirmed: false, reason: 'ambiguous', ...at(found[0]!) };
  }
  const worst = outcomes.toSorted(
    (a, b) =>
      REVIEW_ORDER.indexOf(reasonOf(a)) - REVIEW_ORDER.indexOf(reasonOf(b))
  )[0]!;
  return { confirmed: false, reason: reasonOf(worst), ...at(worst) };
}
