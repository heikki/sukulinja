// The Reader: a vision model behind three questions about one Image of a
// Volume. The matcher depends only on this interface; the real Reader lives
// with the scripts (scripts/vision), so the app itself never calls a model.
//
// "Unreadable" and "not found" are answers, not errors: a smudged page
// number is skipped rather than guessed, and a model's refusal reads as
// unreadable.

import { createHash } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

import type { EntryName, Household } from './record';

// Where an entry is on an Image, in fractions of its width and height:
// what a reading gives, whatever size the model read the Image at. A Box
// saved is in pixels of the full-size Image (see Box).
export interface Fractions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageRef {
  volumeId: string;
  image: number;
}

// Who to look for: the name as the tree or the citation has it, with the
// event date (YYYY-MM-DD, or a shorter prefix), village, household, and the
// others an index entry names, where known.
export interface Person {
  name: string;
  date?: string | null;
  village?: string | null;
  household?: Household | null;
  named?: EntryName[];
}

export interface Unreadable {
  unreadable: true;
}

// The Page numbers written on the Image: one for a book numbering spreads,
// two for one numbering pages.
export type PagesReading = { pages: number[] } | Unreadable;

// Which register an Image's entries are in: one Volume may hold its
// marriages and its baptisms one after the other, each in date order.
export type Register = 'baptisms' | 'marriages' | 'other';

// The earliest and latest entry dates on the Image, as YYYY-MM-DD; empty on
// an Image of another register whose dates can't be read.
export type DatesReading =
  { earliest: string; latest: string; register: Register } | Unreadable;

// Whether the person is written on the Image, and how sure the model is,
// from 0 to 1; where found, the birth year written beside them and the
// date of the baptism or marriage the entry records (YYYY-MM-DD; null when
// none is written), and where their entry is.
export type EntryReading =
  | {
      found: boolean;
      confidence: number;
      bornYear?: number | null;
      date?: string | null;
      box?: Fractions | null;
    }
  | Unreadable;

export type Question = 'pages' | 'dates' | 'entry';

export interface Reader {
  // The model answering each question; a reading is cached per model.
  models: Record<Question, string>;
  // A question's version, changed when what it asks changes, so readings
  // made before are asked again.
  versions?: Partial<Record<Question, string>>;
  pageNumbers: (at: ImageRef) => Promise<PagesReading>;
  dates: (at: ImageRef) => Promise<DatesReading>;
  findEntry: (at: ImageRef, person: Person) => Promise<EntryReading>;
}

export function isUnreadable(reading: object): reading is Unreadable {
  return 'unreadable' in reading;
}

function yearOf(text: string | null | undefined) {
  const year = /1[5-9]\d\d/.exec(text ?? '')?.[0];
  return year === undefined ? null : Number(year);
}

// Books written years apart can disagree on a birth year by one.
const BIRTH_YEAR_SLACK = 1;
// How far an entry's date may stray from the cited one, in days: a day
// misread, or a month.
const DATE_SLACK_DAYS = 31;

// A date's day count, near enough for comparing within weeks: months of
// 31 days. A date given to the year or month runs from its first day to its
// last.
function dayCount(date: string, end: boolean) {
  const [y, m, d] = date.split('-').map(Number);
  const month = m ?? (end ? 12 : 1);
  const day = d ?? (end ? 31 : 1);
  return (y! * 12 + month) * 31 + day;
}

// Whether the date written for the entry falls within slack of the cited
// one, which may be given only to the month or year.
function sameEvent(cited: string, written: string) {
  const day = dayCount(written, false);
  return (
    day >= dayCount(cited, false) - DATE_SLACK_DAYS &&
    day <= dayCount(cited, true) + DATE_SLACK_DAYS
  );
}

type Found = Exclude<EntryReading, Unreadable>;

// Where the reference cites the event's date, whether the entry is written
// with it. With no date read for the entry, it isn't: a name alone has
// matched another entry months away.
function datesAgree(person: Person, reading: Found) {
  const cited = person.date ?? null;
  if (cited === null) return true;
  const written = reading.date ?? null;
  return written !== null && sameEvent(cited, written);
}

// Where both the record and the scan give a birth year, whether it's the
// same one.
function bornAgree(person: Person, reading: Found) {
  const known = yearOf(person.household?.born);
  const read = reading.bornYear ?? null;
  return (
    known === null ||
    read === null ||
    Math.abs(known - read) <= BIRTH_YEAR_SLACK
  );
}

// Whether a reading confirms the person: found, written with the cited
// date, and born the year the record says. Two people of one name are told
// apart by when they were born, and two entries of one family by when they
// were written, whatever the model concluded.
export function confirms(person: Person, reading: EntryReading) {
  if (isUnreadable(reading) || !reading.found) return false;
  return datesAgree(person, reading) && bornAgree(person, reading);
}

// ---------------------------------------------------------------- cache

// Every reading on disk, one file per Volume, Image, question (with the
// person asked about) and model: a re-run asks nothing twice, and a changed
// model reads again.
export function cachedReader(reader: Reader, dir: string): Reader {
  async function cached<T>(
    at: ImageRef,
    question: Question,
    person: Person | null,
    read: () => Promise<T>
  ) {
    const model = reader.models[question];
    const version = reader.versions?.[question];
    const key = JSON.stringify(
      version === undefined
        ? [question, model, person]
        : [question, model, version, person]
    );
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
    const path = join(dir, at.volumeId, `${at.image}-${question}-${hash}.json`);
    const file = Bun.file(path);
    if (await file.exists()) {
      return ((await file.json()) as { answer: T }).answer;
    }
    const answer = await read();
    // Written aside and moved in, so a cut-off run never leaves half a file.
    const body = { ...at, question, model, person, answer };
    await Bun.write(`${path}.part`, `${JSON.stringify(body)}\n`);
    await rename(`${path}.part`, path);
    return answer;
  }
  return {
    models: reader.models,
    ...(reader.versions === undefined ? {} : { versions: reader.versions }),
    pageNumbers: async (at) =>
      await cached(at, 'pages', null, async () => await reader.pageNumbers(at)),
    dates: async (at) =>
      await cached(at, 'dates', null, async () => await reader.dates(at)),
    findEntry: async (at, person) =>
      await cached(
        at,
        'entry',
        person,
        async () => await reader.findEntry(at, person)
      )
  };
}
