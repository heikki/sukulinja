// Test support for the pins: references, vision matches, and an Astia
// listing whatever file ids a test gives.

import type { Astia } from './astia';
import { memoryAstia } from './memory-astia';
import type { ChurchBookRef } from './record';

export const BOX = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };

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

export function vision(volumeId: string, image: number, onCitedPage = false) {
  return { volumeId, volume: volumeId, image, onCitedPage, box: BOX };
}

// An Astia listing each Volume's file ids as `lists` gives them now: none
// for a Volume it leaves out, so pins there save no file id.
export function listedAstia(lists: () => Record<string, string[]>): Astia {
  return {
    ...memoryAstia({}),
    volumeImages: (volumeId) => Promise.resolve(lists()[volumeId] ?? [])
  };
}
