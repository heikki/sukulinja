// Test support for the pins: references, vision matches, and an Astia
// listing whatever file ids a test gives.

import { openDb } from '../db';
import type { Astia } from './astia';
import type { Pins } from './locate';
import { openMarks } from './marks';
import { memoryAstia } from './memory-astia';
import { openPins, openVolumeFacts } from './pins';
import type { ChurchBookRef } from './record';

// In pixels of the full-size Image.
export const BOX = { left: 100, top: 400, width: 500, height: 50 };

// A rippikirja reference to the record, on the page when given.
export function ref(recordId: number | null, page: number | null = null) {
  const item = recordId ?? 'none';
  const book: ChurchBookRef = {
    url: `https://www.myheritage.fi/research/collection-10509/x?itemId=${item}`,
    collection: '10509',
    parish: 'Juva',
    kind: 'rippi',
    years: { from: 1790, to: 1796 },
    page,
    places: [],
    recordId,
    name: null,
    date: null,
    household: null,
    named: []
  };
  return book;
}

// A dataset's database with a citation of each page given, each by a
// person of its own.
export function citing(
  pages: Array<string | { page: string; text?: string | null }>,
  path = ':memory:'
) {
  const db = openDb(path);
  const insert = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', ?, ?, ?, 0)`
  );
  pages.forEach((p, i) => {
    const { page, text = null } = typeof p === 'string' ? { page: p } : p;
    insert.run(i + 1, page, text);
  });
  return db;
}

// The pins of a data folder and a dataset's database.
export function pinsOf(
  folder: string,
  db: ReturnType<typeof openDb>,
  options: { astia: Astia; base?: Pins['volumes'] }
) {
  return openPins(openVolumeFacts(folder, options), openMarks(db));
}

export function vision(volumeId: string, image: number, onCitedPage = false) {
  return { volumeId, volume: volumeId, image, onCitedPage, box: BOX };
}

// An Astia listing each Volume's file ids as `lists` gives them now: none
// for a Volume it leaves out, so pins there save no file id.
export function listedAstia(lists: () => Record<string, string[]>): Astia {
  return {
    ...memoryAstia({}),
    volumeImages: (volumeId) => Promise.resolve(lists()[volumeId] ?? []),
    cachedImages: (volumeId) => Promise.resolve(lists()[volumeId] ?? null)
  };
}
