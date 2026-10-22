// Test support for the pins: references, Matches, and an Astia
// listing whatever file ids a test gives.

import type { Box } from '@/common/types';

import { openDb } from '../db';
import type { Astia } from './astia';
import type { Pins } from './locate';
import type { Match } from './matcher';
import { memoryAstia } from './memory-astia';
import type { ChurchBookRef } from './record';
import { openScanFolder } from './scans';
import type { ImageSizeOf } from './scans';
import { JUVA } from './test-parish';

// In pixels of the full-size Image.
export const BOX = { left: 100, top: 400, width: 500, height: 50 };

// Every Image's size where a test tells one.
export const SIZE = { width: 1000, height: 1000 };

// The Box in fractions of an Image of SIZE.
export function fractionsOf(box: Box) {
  return {
    left: box.left / SIZE.width,
    top: box.top / SIZE.height,
    width: box.width / SIZE.width,
    height: box.height / SIZE.height
  };
}

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

// A dataset's Scans over a data folder.
export function scansOf(
  folder: string,
  db: ReturnType<typeof openDb>,
  options: { astia: Astia; base?: Pins['volumes']; sizeOf?: ImageSizeOf }
) {
  const { sizeOf, ...opened } = options;
  return openScanFolder(folder, opened).scans(db, { sizeOf });
}

// A Match the vision model confirmed at BOX, on an Image of SIZE.
export function match(
  volumeId: string,
  image: number,
  onCitedPage = false
): Match {
  return {
    confirmed: true,
    volumeId,
    volume: volumeId,
    image,
    onCitedPage,
    box: fractionsOf(BOX)
  };
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

// Volumes a–y of Juva's archive, of 50 Images each: a is the Book the
// rippikirja references (ref) cite, and holds a Page pin and a Record
// range in BASE; b is another Book.
export const LABELS = {
  a: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  b: 'I Aa:2 Pää- ja rippikirjat (1797-1803)',
  c: 'I Ab:1 Lastenkirjat (1790-1796)',
  d: 'I Aa:3 Pää- ja rippikirjat (1804-1810)',
  x: 'I Aa:4 Pää- ja rippikirjat (1811-1817)',
  y: 'I Aa:5 Pää- ja rippikirjat (1818-1824)'
};

export function pinsParish() {
  return memoryAstia({
    [JUVA]: {
      volumes: Object.entries(LABELS).map(([id, label]) => ({
        id,
        label,
        images: 50
      }))
    }
  });
}

// The records the tests save, each cited once, and a reference with no
// Record number.
export const CITED = [150, 160, 12, 50, 250, 450, 650, 800, 5000, null].map(
  (r) => ref(r).url
);

export const BASE: Pins['volumes'] = {
  a: {
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [20] }],
    ranges: [{ from: 100, to: 200 }]
  }
};
