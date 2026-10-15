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

export interface ImageRef {
  volumeId: string;
  image: number;
}

// Who to look for: the name as the tree or the citation has it, with the
// event date (YYYY-MM-DD, or a shorter prefix) and village where known.
export interface Person {
  name: string;
  date?: string | null;
  village?: string | null;
}

export interface Unreadable {
  unreadable: true;
}

// The Page numbers written on the Image: one for a book numbering spreads,
// two for one numbering pages.
export type PagesReading = { pages: number[] } | Unreadable;

// The earliest and latest entry dates on the Image, as YYYY-MM-DD.
export type DatesReading = { earliest: string; latest: string } | Unreadable;

// Whether the person is written on the Image, and how sure the model is,
// from 0 to 1.
export type EntryReading = { found: boolean; confidence: number } | Unreadable;

export type Question = 'pages' | 'dates' | 'entry';

export interface Reader {
  // The model answering each question; a reading is cached per model.
  models: Record<Question, string>;
  pageNumbers: (at: ImageRef) => Promise<PagesReading>;
  dates: (at: ImageRef) => Promise<DatesReading>;
  findEntry: (at: ImageRef, person: Person) => Promise<EntryReading>;
}

export function isUnreadable(reading: object): reading is Unreadable {
  return 'unreadable' in reading;
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
    const key = JSON.stringify([question, model, person]);
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
