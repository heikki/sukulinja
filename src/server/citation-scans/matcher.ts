// Matching a Church-book reference to the exact Image it cites, by asking
// the Reader (see reader.ts) what is written on the scans.
//
// A search lands on an Image; a Confirmation then looks for the person's
// name there, and on the Images around it: an entry may continue onto the
// next Image, sit on a Retake, or be one or two Images off where the
// search misread. Only a find-entry "found" confirms. A reference with
// several candidate Volumes is searched in each, and the one the person is
// found in wins; found in more than one, it stays unconfirmed. Where the
// record and the scan both give a birth year, they must agree.
//
// Date search, for baptism and marriage index references: these books run
// in date order, so a binary search over the Volume's Images by the dates
// read on them closes in on the Image whose range covers the cited date.
// One Volume may hold other registers before or after the one cited (its
// marriages and deaths ahead of its baptisms), each in one stretch in date
// order of its own, so only readings of the cited register steer the
// search, and the stretch of another register between the probe and such a
// reading is left out. Nor does a misread steer it: a date outside the
// Volume's years, or a range of more than a year, where a spread holds
// weeks or months.
//
// Page search, for references with a Page number: from the Image the
// estimate gives, read its Page number and jump by the
// difference, until it lands on the cited page. A reading that contradicts
// the jump just made (numbering that starts over, a misread number, the
// other copy of a Doubled volume) isn't followed: the search stays at the
// start, near the Page pins, and Confirmation looks around it.

import type { BookKind, Years } from '@common/types';

import { confirms } from './reader';
import type {
  DatesReading,
  Fractions,
  PagesReading,
  Person,
  Reader,
  Register
} from './reader';
import type { ChurchBookRef } from './record';

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

export type Unconfirmed =
  | 'name not found'
  | 'unreadable'
  | 'did not converge'
  | 'ambiguous'
  | 'no candidate volume'
  | 'no name'
  | 'no box'
  | 'unsupported'
  // Confirmed on an Image where a person took the match back.
  | 'rejected';

export type Match =
  | {
      confirmed: true;
      volumeId: string;
      volume: string;
      image: number;
      // Whether page search read the cited Page number on this very Image,
      // so it can stand as a Page pin.
      onCitedPage: boolean;
      // Where on the Image the entry is: a match saves only with one.
      box: Fractions;
    }
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

type Landing =
  | { image: number; onCitedPage?: boolean; box?: Fractions | null }
  | { reason: Unconfirmed; image: number };

// ---------------------------------------------------------------- dates

// The days a cited date covers: "1829" is the whole year.
export function dayRange(date: string) {
  return { from: date, to: `${date}${'-99'.repeat((10 - date.length) / 3)}` };
}

// Images to try for `at` within lo–hi: the nearest first, then twice as far
// each time, to step past a stretch of another register.
function probes(at: number, lo: number, hi: number) {
  const out = [at];
  for (let d = 1; d <= hi - lo; d = d < 4 ? d + 1 : d * 2) {
    if (at + d <= hi) out.push(at + d);
    if (at - d >= lo) out.push(at - d);
  }
  return out;
}

const REGISTERS: Partial<Record<BookKind, Register>> = {
  kastetut: 'baptisms',
  vihityt: 'marriages'
};

type Dated = Exclude<DatesReading, { unreadable: true }>;

// A reading spanning more months than this is a misread.
const MAX_SPAN_MONTHS = 12;

function yearOf(date: string) {
  return Number(date.slice(0, 4));
}

function monthsOf(date: string) {
  return yearOf(date) * 12 + Number(date.slice(5, 7));
}

// Whether a reading of the cited register can steer the search: within the
// Volume's years, and over no more than a year.
function steers(dates: Dated, years: Years | null) {
  const inYears =
    years === null ||
    (yearOf(dates.earliest) >= years.from && yearOf(dates.latest) <= years.to);
  const span = monthsOf(dates.latest) - monthsOf(dates.earliest);
  return inYears && span <= MAX_SPAN_MONTHS;
}

// Where a step of the search reads: around `mid` within lo–hi, for the
// cited register, with the reads it has left.
interface Step {
  mid: number;
  lo: number;
  hi: number;
  register: Register;
  readsLeft: number;
}

// The reading nearest `mid` that can steer the search, and the Images read
// as another register on the way; giving up after a run of unreadable
// Images or once the reads left are spent.
async function readDatesNear(reader: Reader, c: Candidate, step: Step) {
  let reads = 0;
  let unreadable = 0;
  const foreign: number[] = [];
  for (const image of probes(step.mid, step.lo, step.hi)) {
    if (unreadable === UNREADABLE_PROBES || reads === step.readsLeft) break;
    reads += 1;
    // eslint-disable-next-line no-await-in-loop -- each probe waits on the last
    const dates = await reader.dates({ volumeId: c.volumeId, image });
    if ('unreadable' in dates) unreadable += 1;
    else if (dates.register !== step.register) foreign.push(image);
    else if (steers(dates, c.years)) {
      return { read: { image, dates }, reads, foreign };
    }
  }
  return { read: null, reads, foreign };
}

// lo–hi without the other registers read between `mid` and the reading at
// `image`: the cited register is one stretch, holding `image`, so it starts
// after the nearest of them below it, or ends before the nearest above.
function withoutForeign(
  range: { lo: number; hi: number },
  image: number,
  foreign: number[]
) {
  const below = foreign.filter((f) => f < image);
  const above = foreign.filter((f) => f > image);
  return {
    lo: below.length === 0 ? range.lo : Math.max(range.lo, ...below) + 1,
    hi: above.length === 0 ? range.hi : Math.min(range.hi, ...above) - 1
  };
}

async function dateSearch(
  reader: Reader,
  c: Candidate,
  date: string,
  register: Register
): Promise<Landing> {
  const cited = dayRange(date);
  let lo = 1;
  let hi = c.images;
  let reads = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const step = { mid, lo, hi, register, readsLeft: MAX_READS - reads };
    // eslint-disable-next-line no-await-in-loop -- each step follows a reading
    const near = await readDatesNear(reader, c, step);
    reads += near.reads;
    const { read } = near;
    if (read === null) {
      // Narrowed to a stretch Confirmation looks over anyway.
      if (hi - lo <= 2 * WINDOW) return { image: mid };
      const spent = reads >= MAX_READS;
      return { reason: spent ? 'did not converge' : 'unreadable', image: mid };
    }
    if (reads >= MAX_READS) {
      return { reason: 'did not converge', image: read.image };
    }
    ({ lo, hi } = withoutForeign({ lo, hi }, read.image, near.foreign));
    const { earliest, latest } = read.dates;
    if (cited.to < earliest) hi = read.image - 1;
    else if (cited.from > latest) lo = read.image + 1;
    else return { image: read.image };
  }
  // Between two Images' ranges: the later one, and Confirmation checks the
  // one before.
  return { image: Math.min(Math.max(lo, 1), c.images) };
}

// ---------------------------------------------------------------- pages

// Page readings a search may make in one Volume before giving up.
const MAX_PAGE_READS = 6;
// How far a reading may stray from where the last one put it, in pages.
const PAGE_SLACK = 3;

interface PageRead {
  image: number;
  pages: number[];
}

async function readPagesNear(
  reader: Reader,
  c: Candidate,
  image: number
): Promise<{ read: PageRead | null; reads: number }> {
  const tries = [image, image + 1, image - 1].filter(
    (n) => n >= 1 && n <= c.images
  );
  let reads = 0;
  for (const n of tries) {
    reads += 1;
    // eslint-disable-next-line no-await-in-loop -- each try waits on the last
    const reading: PagesReading = await reader.pageNumbers({
      volumeId: c.volumeId,
      image: n
    });
    if (!('unreadable' in reading)) {
      // A spread's number written on both pages counts once.
      const pages = [...new Set(reading.pages)];
      return { read: { image: n, pages }, reads };
    }
  }
  return { read: null, reads };
}

// Where the cited page should be, counted from one reading.
function target(read: PageRead, page: number, images: number) {
  const first = Math.min(...read.pages);
  const jump = Math.floor((page - first) / read.pages.length);
  return Math.min(Math.max(read.image + jump, 1), images);
}

// Whether a reading disagrees with the one before: the pages it shows
// aren't about where the jump between them put them.
function contradicts(prev: PageRead, read: PageRead) {
  const perImage = prev.pages.length;
  const expected =
    Math.min(...prev.pages) + (read.image - prev.image) * perImage;
  return Math.abs(Math.min(...read.pages) - expected) > PAGE_SLACK * perImage;
}

async function pageSearch(
  reader: Reader,
  c: Candidate,
  page: number
): Promise<Landing> {
  const start = c.start ?? Math.ceil(c.images / 2);
  let image = start;
  let prev: PageRead | null = null;
  let reads = 0;
  while (reads < MAX_PAGE_READS) {
    // eslint-disable-next-line no-await-in-loop -- each jump follows a reading
    const near = await readPagesNear(reader, c, image);
    reads += near.reads;
    const read = near.read;
    // Unreadable here: the start is still the best guess to confirm at.
    if (read === null) return { image: prev?.image ?? start };
    if (read.pages.includes(page)) {
      return { image: read.image, onCitedPage: true };
    }
    if (prev !== null && contradicts(prev, read)) return { image: start };
    const next = target(read, page, c.images);
    // Between the pages of two Images, or at the Volume's end.
    if (next === read.image) return { image: read.image };
    prev = read;
    image = next;
  }
  return { reason: 'did not converge', image };
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
    if (confirms(person, entry)) return { image, box: entry.box ?? null };
  }
  return { reason: readable ? 'name not found' : 'unreadable', image: landed };
}

// ---------------------------------------------------------------- matching

function search(reader: Reader, ref: ChurchBookRef, c: Candidate) {
  const register = ref.kind === null ? undefined : REGISTERS[ref.kind];
  const indexed = register !== undefined;
  if (indexed && ref.date !== null) {
    return dateSearch(reader, c, ref.date, register);
  }
  if (!indexed && ref.page !== null) return pageSearch(reader, c, ref.page);
  // A rippikirja reference with no page needs a village map: not yet.
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
  if ('reason' in landed) return landed;
  const confirmed = await confirm(reader, c, landed.image, person);
  if ('reason' in confirmed) return confirmed;
  const onCitedPage =
    landed.onCitedPage === true && confirmed.image === landed.image;
  return { image: confirmed.image, onCitedPage, box: confirmed.box ?? null };
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

// Whom the Reader looks for: the person a reference names, with what else
// it knows of them. `named` only where there are any, so a rippikirja
// reference asks as before, and its cached readings hold.
export function personOf(ref: ChurchBookRef, name: string): Person {
  return {
    name,
    date: ref.date,
    village: ref.places[0] ?? null,
    household: ref.household,
    ...(ref.named.length > 0 ? { named: ref.named } : {})
  };
}

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
  const person = personOf(ref, ref.name);
  const outcomes: Outcome[] = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop -- one Volume at a time
    outcomes.push({ c, landing: await matchIn(reader, ref, c, person) });
  }
  const found = outcomes.filter((o) => !('reason' in o.landing));
  if (found.length === 1) {
    const [only] = found as [Outcome];
    const landing = only.landing as {
      onCitedPage?: boolean;
      box?: Fractions | null;
    };
    // A suggestion points at the entry; without one it's left for review.
    if (landing.box === undefined || landing.box === null) {
      return { confirmed: false, reason: 'no box', ...at(only) };
    }
    return {
      confirmed: true,
      ...at(only),
      onCitedPage: landing.onCitedPage === true,
      box: landing.box
    };
  }
  if (found.length > 1) {
    return { confirmed: false, reason: 'ambiguous', ...at(found[0]!) };
  }
  const worst = outcomes.toSorted(
    (a, b) =>
      REVIEW_ORDER.indexOf(reasonOf(a)) - REVIEW_ORDER.indexOf(reasonOf(b))
  )[0]!;
  return { confirmed: false, reason: reasonOf(worst), ...at(worst) };
}
