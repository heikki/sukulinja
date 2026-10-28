import { describe, expect, test } from 'bun:test';

import { parseChurchBookRef } from '@/server/citations/myheritage/record';

import { BOX, candidate, fakeReader } from './fake-reader';
import type { Volume } from './fake-reader';
import { matchRef } from './matcher';

// A rippikirja citation of `page`, for a made-up person.
function rippi(name: string, page: number, kind = 'Rippikirja') {
  return parseChurchBookRef(
    'https://www.myheritage.fi/research/collection-10509/x?itemId=1',
    `${name}\nKirja:${kind}, 1794 - 1808\nHallintoalue:PitäjäSivu:${page}`
  );
}

function numbered(
  page: (image: number) => number | number[] | null,
  names: Record<number, string[]> = {}
): Volume {
  return {
    pages: (image) => {
      const p = page(image);
      if (p === null) return { unreadable: true };
      return { pages: Array.isArray(p) ? p : [p] };
    },
    names
  };
}

function at(volumeId: string, images: number, start: number | null) {
  return { ...candidate(volumeId, images), start };
}

const MATTI = 'Matti Esimerkki';

describe('page search', () => {
  test('converges from an Estimated start', async () => {
    // Four unnumbered leaves at the front: page n is on Image n + 4.
    const { reader } = fakeReader({
      r: numbered((i) => i - 4, { 124: [MATTI] })
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 300, 120)], reader)
    ).toEqual({
      confirmed: true,
      volumeId: 'r',
      volume: 'r label',
      image: 124,
      onCitedPage: true,
      box: BOX
    });
  });

  test('counts two pages to an Image in a book numbering pages', async () => {
    // Image n carries pages 2n - 10 and 2n - 9; page 81 is on Image 45.
    const { reader } = fakeReader({
      r: numbered((i) => [2 * i - 10, 2 * i - 9], { 45: [MATTI] })
    });
    expect(
      await matchRef(
        rippi(MATTI, 81, 'Lastenkirja'),
        [at('r', 300, 41)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 45 });
  });

  test("counts a spread's number written on both pages once", async () => {
    const { reader } = fakeReader({
      r: numbered((i) => [i - 4, i - 4], { 124: [MATTI] })
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 300, 120)], reader)
    ).toMatchObject({ confirmed: true, image: 124, onCitedPage: true });
  });

  test('tells namesakes apart by the birth year written beside them', async () => {
    // Two daughters named Anna on neighbouring spreads; the record's was
    // born in 1784, the one on the cited page in 1791.
    const { reader } = fakeReader({
      r: {
        ...numbered((i) => i - 4, { 124: ['Anna'], 125: ['Anna'] }),
        born: { 124: { Anna: 1791 }, 125: { Anna: 1784 } }
      }
    });
    const anna = {
      ...rippi('Anna', 120),
      household: {
        born: '22. Heinä 1784',
        relation: 'Tytär',
        with: MATTI,
        members: []
      }
    };
    expect(await matchRef(anna, [at('r', 300, 120)], reader)).toMatchObject({
      confirmed: true,
      image: 125,
      onCitedPage: false
    });
    // A year off is still the same person: books disagree by that much.
    const { reader: lenient } = fakeReader({
      r: {
        ...numbered((i) => i - 4, { 124: ['Anna'] }),
        born: { 124: { Anna: 1785 } }
      }
    });
    expect(await matchRef(anna, [at('r', 300, 120)], lenient)).toMatchObject({
      confirmed: true,
      image: 124
    });
  });

  test('finds a misread cited page on the Images around it', async () => {
    // Cited as page 120, but the entry is on page 122.
    const { reader } = fakeReader({
      r: numbered((i) => i - 4, { 126: [MATTI] })
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 300, 120)], reader)
    ).toMatchObject({ confirmed: true, image: 126, onCitedPage: false });
  });

  test('stays in the numbering that starts over, near the Page pins', async () => {
    // Pages 1–150 on Images 1–150, then 1–150 again on Images 151–300.
    // Image 199 shows page 49 but reads as 149; following it would lead
    // to page 49 of the first numbering.
    const { reader } = fakeReader({
      r: numbered((i) => (i === 199 ? 149 : i <= 150 ? i : i - 150), {
        49: [MATTI],
        199: [MATTI]
      })
    });
    expect(
      await matchRef(rippi(MATTI, 49), [at('r', 300, 201)], reader)
    ).toMatchObject({ confirmed: true, image: 199 });
  });

  test('matches a Doubled volume in the copy the Page pins point into', async () => {
    // The book twice: pages 1–200 on Images 1–200 and again on 201–400.
    const { reader } = fakeReader({
      r: numbered((i) => (i <= 200 ? i : i - 200), {
        120: [MATTI],
        320: [MATTI]
      })
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 400, 318)], reader)
    ).toMatchObject({ confirmed: true, image: 320 });
  });

  test('confirms at the start where the Page numbers are unreadable', async () => {
    const { reader } = fakeReader({
      r: numbered(() => null, { 121: [MATTI] })
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 300, 120)], reader)
    ).toMatchObject({ confirmed: true, image: 121 });
  });

  test('unreadable Page numbers and names', async () => {
    const faint = new Set(Array.from({ length: 300 }, (_, i) => i + 1));
    const { reader } = fakeReader({
      r: { ...numbered(() => null, { 120: [MATTI] }), faint }
    });
    expect(
      await matchRef(rippi(MATTI, 120), [at('r', 300, 120)], reader)
    ).toEqual({
      confirmed: false,
      reason: 'unreadable',
      volumeId: 'r',
      volume: 'r label',
      image: 120
    });
  });

  test('a search that never lands on the cited page', async () => {
    // Only every fourth page number is written, and the cited one isn't.
    const { reader } = fakeReader({
      r: numbered((i) => i - (i % 4), { 102: [MATTI] })
    });
    expect(
      await matchRef(rippi(MATTI, 102), [at('r', 300, 50)], reader)
    ).toMatchObject({ confirmed: false, reason: 'did not converge' });
  });
});

// Part I holds pages 1–150, Part II continues with 151–300; neither
// start is known.
function partI(names: Record<number, string[]> = {}) {
  return numbered((i) => i, names);
}

function partII(names: Record<number, string[]> = {}) {
  return numbered((i) => i + 150, names);
}

describe('Split references', () => {
  test('resolved to the Part the person is found in', async () => {
    const { reader } = fakeReader({ i: partI(), ii: partII({ 20: [MATTI] }) });
    expect(
      await matchRef(
        rippi(MATTI, 170),
        [at('i', 150, null), at('ii', 150, null)],
        reader
      )
    ).toMatchObject({ confirmed: true, volumeId: 'ii', image: 20 });
  });

  test('left ambiguous when the name is found in both Parts', async () => {
    const { reader } = fakeReader({
      i: partI({ 150: [MATTI] }),
      ii: partII({ 20: [MATTI] })
    });
    expect(
      await matchRef(
        rippi(MATTI, 170),
        [at('i', 150, null), at('ii', 150, null)],
        reader
      )
    ).toMatchObject({ confirmed: false, reason: 'ambiguous' });
  });
});
