import { expect, test } from 'bun:test';

import type { BookKind } from '@/common/types';

import { pageNumbering } from './';
import type { NumberedPin } from './';

function pin(image: number, ...pages: number[]): NumberedPin {
  return { image, pages };
}

// Where the page is placed, by pins or numbering alike.
function placed(n: ReturnType<typeof pageNumbering>, page: number) {
  const p = n.place(page);
  return p.from === 'numbering'
    ? p.image === null
      ? []
      : [p.image]
    : p.places.map((x) => x.image);
}

// Every page placed is shown on the Image it's placed on, unless a pin
// there says what's written.
function expectShownWherePlaced(
  pins: NumberedPin[],
  images: number,
  kind: BookKind | null,
  pages: number[]
) {
  const n = pageNumbering(pins, images, kind);
  const shown = n.pages();
  for (const page of pages) {
    for (const image of placed(n, page)) {
      const on = shown.find((p) => p.image === image);
      if (on !== undefined && on.by !== null) continue;
      expect({ page, image, on: on?.pages.includes(page) }).toEqual({
        page,
        image,
        on: true
      });
    }
  }
}

test('a page counted between two pins is shown on the Image it is placed on', () => {
  // Twenty pages over ten Images: page 15 on Image 12, with page 14.
  const n = pageNumbering([pin(10, 10), pin(20, 30)], 40, 'rippi');
  expect(placed(n, 15)).toEqual([12]);
  expect(n.pages().find((p) => p.image === 12)).toEqual({
    image: 12,
    pages: [14, 15],
    by: null
  });
});

test('every page placed is shown where it is placed', () => {
  const pages = Array.from({ length: 200 }, (_, i) => i + 1);
  // One run at one a spread, pages missing, leaves inserted.
  expectShownWherePlaced([pin(10, 10), pin(20, 30)], 60, 'rippi', pages);
  expectShownWherePlaced([pin(5, 3), pin(30, 15)], 60, 'rippi', pages);
  // By page, two runs, an aside and an Image set to have no page.
  expectShownWherePlaced(
    [pin(4, 6, 7), pin(30, 58, 59), pin(40, 1, 2), pin(70, 61, 62)],
    90,
    'lasten',
    pages
  );
  expectShownWherePlaced(
    [pin(2, 1), pin(15, 30), pin(17, 5), pin(20, 40), pin(25)],
    50,
    'rippi',
    pages
  );
  // Without pins.
  expectShownWherePlaced([], 80, 'rippi', pages.slice(0, 80));
  expectShownWherePlaced([], 80, 'lasten', pages.slice(0, 160));
});

test('every Image of the Volume shows its pages', () => {
  const n = pageNumbering([pin(10, 10), pin(20, 15), pin(25)], 40, 'rippi');
  const shown = n.pages();
  expect(shown.map((p) => p.image)).toEqual(
    Array.from({ length: 40 }, (_, i) => i + 1)
  );
  // More Images than pages between two pins: one shows the page before.
  expect(shown.find((p) => p.image === 11)).toEqual({
    image: 11,
    pages: [10],
    by: null
  });
  expect(shown.find((p) => p.image === 25)).toEqual({
    image: 25,
    pages: [],
    by: 'hand'
  });
});

test("without pins, a rippikirja's page past it by spread is counted by page", () => {
  const n = pageNumbering([], 100, 'rippi');
  expect(n.place(60)).toEqual({ from: 'numbering', image: 60 });
  expect(n.place(160)).toEqual({ from: 'numbering', image: 81 });
  expect(n.place(260)).toEqual({ from: 'numbering', image: null });
  // The Images still show one a spread.
  expect(n.pages().find((p) => p.image === 81)?.pages).toEqual([81]);
});

test('a new pin follows how the Volume numbers its pages', () => {
  expect(pageNumbering([], 100, 'rippi').pinPages(40)).toEqual([40]);
  expect(pageNumbering([], 100, 'lasten').pinPages(40)).toEqual([40, 41]);
  expect(pageNumbering([pin(3, 4, 5)], 100, 'rippi').pinPages(40)).toEqual([
    40, 41
  ]);
  expect(pageNumbering([pin(3, 4)], 100, 'lasten').pinPages(40)).toEqual([40]);
});
