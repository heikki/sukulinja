// Which pins a Volume's filming leaves out: every kind of pin on an
// Image, against the filming it was made on and the one after a Re-scan.

import { describe, expect, test } from 'bun:test';

import { leavesOut, split, splitVolume, withoutStale } from './filming';
import type { Filming } from './filming';
import type { Pins } from './locate';
import { fileId, memoryAstia } from './memory-astia';

// Volume v of ten Images, as first filmed and as re-scanned with eight.
const FIRST: Filming = {
  volumeId: 'v',
  files: Array.from({ length: 10 }, (_, i) => fileId('v', i + 1, 'full'))
};
const RESCANNED: Filming = {
  volumeId: 'v',
  files: Array.from({ length: 8 }, (_, i) => fileId('v', i + 1, 'full', 2))
};

interface Place {
  where: string;
  at: { image?: number; fileId?: string };
  // Whether each filming keeps a pin saved there.
  kept: { first: boolean; rescanned: boolean };
}

const PLACES: Place[] = [
  {
    where: 'on Image 4 of the first filming',
    at: { image: 4, fileId: 'v-f4' },
    kept: { first: true, rescanned: false }
  },
  {
    // Past the re-scan's eight Images.
    where: 'on Image 9 of the first filming',
    at: { image: 9, fileId: 'v-f9' },
    kept: { first: true, rescanned: false }
  },
  {
    where: "on Image 4, with Image 5's file id",
    at: { image: 4, fileId: 'v-f5' },
    kept: { first: false, rescanned: false }
  },
  {
    where: 'on Image 4 of the re-scan',
    at: { image: 4, fileId: 'v-2-f4' },
    kept: { first: false, rescanned: true }
  },
  {
    where: 'on Image 4, saved before file ids',
    at: { image: 4 },
    kept: { first: true, rescanned: true }
  },
  {
    where: 'in the Volume alone',
    at: {},
    kept: { first: true, rescanned: true }
  }
];

// Every kind of pin, saved at `at`: Page and Record pins are a Volume's
// own, the rest name their Volume.
function pinsAt(at: { image?: number; fileId?: string }) {
  return {
    'Page pin': { pages: [7], by: 'hand' as const, ...at },
    'Record pin': { record: 70, by: 'hand' as const, ...at },
    'Reference pin': { volumeId: 'v', volume: 'V', ...at },
    'Rejection': { volumeId: 'v', ...at },
    'Link': { volumeId: 'v', volume: 'V', by: 'vision' as const, ...at }
  };
}

const ON_IMAGE_ONLY = new Set(['Page pin', 'Record pin', 'Rejection']);

const cases = PLACES.flatMap(({ where, at, kept }) =>
  Object.entries(pinsAt(at))
    .filter(([kind]) => at.image !== undefined || !ON_IMAGE_ONLY.has(kind))
    .flatMap(([kind, pin]) =>
      (['first', 'rescanned'] as const).map((filming) => ({
        kind,
        where,
        filming,
        pin,
        kept: kept[filming]
      }))
    )
);

const FILMING = { first: FIRST, rescanned: RESCANNED };

describe('pins × filming', () => {
  test.each(cases)(
    'a $kind $where, on the $filming filming',
    ({ filming, pin, kept }) => {
      expect(split(FILMING[filming], [pin])).toEqual(
        kept ? { current: [pin], stale: [] } : { current: [], stale: [pin] }
      );
      if ('volumeId' in pin) {
        expect(leavesOut(FILMING[filming], pin)).toBe(!kept);
      }
    }
  );
});

test("a filming says nothing of another Volume's pins", () => {
  const pin = { volumeId: 'w', volume: 'W', image: 4, fileId: 'w-f4' };
  expect(leavesOut(RESCANNED, pin)).toBe(false);
});

test("a Volume's own Page and Record pins split together", () => {
  const page = { image: 4, pages: [7], fileId: 'v-f4' };
  const newPage = { image: 5, pages: [9], fileId: 'v-2-f5' };
  const record = { record: 70, image: 6, fileId: 'v-f6' };
  const pins: Pins = {
    volumes: {
      v: { pages: [page, newPage], records: [record] },
      w: { pages: [{ image: 4, pages: [7], fileId: 'w-f4' }] }
    },
    references: {}
  };
  expect(splitVolume(RESCANNED, pins)).toEqual({
    current: { pages: [newPage], records: [] },
    stale: { pages: [page], records: [record] }
  });
  expect(splitVolume({ volumeId: 'x', files: [] }, pins)).toEqual({
    current: { pages: [], records: [] },
    stale: { pages: [], records: [] }
  });
});

test('every Volume read against the filming Astia lists now', async () => {
  const astia = memoryAstia({
    '1': {
      volumes: [
        { id: 'v', label: 'V', images: 10 },
        { id: 'w', label: 'W', images: 10 }
      ]
    }
  });
  astia.rescan('v', 8);
  await astia.refreshImages('v');
  const kept = { image: 4, pages: [7], fileId: 'w-f4' };
  const pins: Pins = {
    volumes: {
      v: {
        pages: [{ image: 4, pages: [7], fileId: 'v-f4' }],
        records: [{ record: 70, image: 6, fileId: 'v-f6' }]
      },
      w: { pages: [kept] }
    },
    references: {
      'ref-v': { volumeId: 'v', volume: 'V', image: 2, fileId: 'v-f2' },
      'ref-w': { volumeId: 'w', volume: 'W', image: 2, fileId: 'w-f2' }
    }
  };
  expect(await withoutStale(pins, astia)).toEqual({
    volumes: { v: { pages: [], records: [] }, w: { pages: [kept] } },
    references: { 'ref-w': pins.references['ref-w']! }
  });
});
