import { describe, expect, test } from 'bun:test';

import { matchRef } from './matcher';
import type { Candidate } from './matcher';
import type { DatesReading, PagesReading, Reader } from './reader';
import { parseChurchBookRef } from './record';

const DAY = 24 * 60 * 60 * 1000;

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A scripted Volume: what each Image's dates and Page numbers read as, and
// who is on it.
interface Volume {
  dates?: (image: number) => DatesReading;
  pages?: (image: number) => PagesReading;
  names: Record<number, string[]>;
  // The birth year written beside a name, by Image.
  born?: Record<number, Record<string, number>>;
  // Images whose writing is too faint to find anyone on.
  faint?: Set<number>;
}

// Where the fake Reader says every entry it finds is.
const BOX = { left: 0.1, top: 0.2, width: 0.3, height: 0.05 };

// A baptism Volume of `images` Images, each covering ten days from New
// Year 1820, so Image n holds 1820-01-01 + 10 (n - 1) days onwards.
function baptisms(images: number, names: Record<number, string[]> = {}) {
  const start = Date.UTC(1820, 0, 1);
  return {
    images,
    volume: {
      dates: (image: number) =>
        image > images
          ? { unreadable: true as const }
          : {
              earliest: iso(start + (image - 1) * 10 * DAY),
              latest: iso(start + ((image - 1) * 10 + 9) * DAY)
            },
      names
    } satisfies Volume
  };
}

function fakeReader(volumes: Record<string, Volume>) {
  const asked: string[] = [];
  const reader: Reader = {
    models: { pages: 'fake', dates: 'fake', entry: 'fake' },
    pageNumbers: async ({ volumeId, image }) => {
      asked.push(`pages ${volumeId} ${image}`);
      const pages = volumes[volumeId]!.pages;
      return await Promise.resolve(
        pages === undefined ? { unreadable: true } : pages(image)
      );
    },
    dates: async ({ volumeId, image }) => {
      asked.push(`dates ${volumeId} ${image}`);
      const dates = volumes[volumeId]!.dates;
      return await Promise.resolve(
        dates === undefined ? { unreadable: true } : dates(image)
      );
    },
    findEntry: async ({ volumeId, image }, { name }) => {
      asked.push(`entry ${volumeId} ${image}`);
      const v = volumes[volumeId]!;
      if (v.faint?.has(image) === true) {
        return await Promise.resolve({ unreadable: true });
      }
      const found = (v.names[image] ?? []).includes(name);
      return await Promise.resolve({
        found,
        confidence: 0.9,
        bornYear: v.born?.[image]?.[name] ?? null,
        box: found ? BOX : null
      });
    }
  };
  return { reader, asked };
}

// A baptism index citation in MyHeritage's shape, for a made-up person.
function baptism(name: string, date: string) {
  return parseChurchBookRef(
    'https://www.myheritage.fi/research/collection-30233/x?itemId=7',
    `${name}\nRistiäiset: ${date} - Pitäjä, Lääni, Finland\nIsä: Matti Esimerkki`
  );
}

function candidate(volumeId: string, images: number): Candidate {
  return { volumeId, volume: `${volumeId} label`, images, start: null };
}

// 1820-01-01 + 1365 days = 1823-09-27, on Image 137 of a ten-day Volume.
const CITED = '27. Syys 1823';

describe('date search', () => {
  test('finds the Image whose dates cover the cited date', async () => {
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ b: volume });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toEqual({
      confirmed: true,
      volumeId: 'b',
      volume: 'b label',
      image: 137,
      onCitedPage: false,
      box: BOX
    });
  });

  test('finds an entry continued onto the next Image, or two off', async () => {
    for (const image of [138, 136, 139]) {
      const { volume, images } = baptisms(400, { [image]: ['Juho Esimerkki'] });
      const { reader } = fakeReader({ b: volume });
      // eslint-disable-next-line no-await-in-loop -- one Volume at a time
      const match = await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      );
      expect(match).toMatchObject({ confirmed: true, image });
    }
  });

  test('reads past unreadable Images, such as an index at the front', async () => {
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { dates } = volume;
    const { reader } = fakeReader({
      b: {
        ...volume,
        dates: (image) =>
          image % 3 === 0 ? { unreadable: true } : dates(image)
      }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 137 });
  });

  test('a cited month lands within it', async () => {
    // September 1823 is on Images 135–138.
    const { volume, images } = baptisms(400, { 135: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ b: volume });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', 'Syys 1823'),
        [candidate('b', images)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 135 });
  });
});

describe('unconfirmed', () => {
  test('a name not on the Images around the date', async () => {
    const { volume, images } = baptisms(400, { 300: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ b: volume });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toEqual({
      confirmed: false,
      reason: 'name not found',
      volumeId: 'b',
      volume: 'b label',
      image: 137
    });
  });

  test('a Volume whose dates are unreadable', async () => {
    const { reader } = fakeReader({
      b: { dates: () => ({ unreadable: true }), names: {} }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', 400)],
        reader
      )
    ).toMatchObject({ confirmed: false, reason: 'unreadable', volumeId: 'b' });
  });

  test('closes in on the cited date where the last Images are unreadable', async () => {
    const { volume, images } = baptisms(4096, { 137: ['Juho Esimerkki'] });
    const { dates } = volume;
    const { reader } = fakeReader({
      b: {
        ...volume,
        dates: (image) =>
          Math.abs(image - 137) > 3 ? dates(image) : { unreadable: true }
      }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 137 });
  });

  test('Images too faint to find the name on', async () => {
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const faint = new Set(Array.from({ length: 400 }, (_, i) => i + 1));
    const { reader } = fakeReader({ b: { ...volume, faint } });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toMatchObject({ confirmed: false, reason: 'unreadable', image: 137 });
  });

  test('a search that runs out of reads', async () => {
    // Only every fourth Image's dates are readable, in a very long Volume.
    const { volume, images } = baptisms(100_000, { 137: ['Juho Esimerkki'] });
    const { dates } = volume;
    const { reader } = fakeReader({
      b: {
        ...volume,
        dates: (image) =>
          image % 4 === 0 ? dates(image) : { unreadable: true }
      }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      )
    ).toMatchObject({ confirmed: false, reason: 'did not converge' });
  });

  test('no candidate Volume, no name, or a rippikirja reference', async () => {
    const { reader, asked } = fakeReader({});
    expect(
      await matchRef(baptism('Juho Esimerkki', CITED), [], reader)
    ).toEqual({ confirmed: false, reason: 'no candidate volume' });
    expect(
      await matchRef(
        { ...baptism('Juho Esimerkki', CITED), name: null },
        [candidate('b', 400)],
        reader
      )
    ).toEqual({ confirmed: false, reason: 'no name' });
    const rippi = parseChurchBookRef(
      'https://www.myheritage.fi/research/collection-10509/x?itemId=1',
      'Matti Esimerkki\nKirja:Rippikirja, 1794 - 1808\nHallintoalue:Pitäjä'
    );
    expect(
      await matchRef(rippi, [{ ...candidate('r', 300), start: 40 }], reader)
    ).toMatchObject({ confirmed: false, reason: 'unsupported', image: 40 });
    expect(asked).toEqual([]);
  });
});

describe('several candidate Volumes', () => {
  test('the one the person is found in wins', async () => {
    const a = baptisms(400);
    const b = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ a: a.volume, b: b.volume });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('a', 400), candidate('b', 400)],
        reader
      )
    ).toMatchObject({ confirmed: true, volumeId: 'b', image: 137 });
  });

  test('found in more than one, it stays unconfirmed', async () => {
    const a = baptisms(400, { 137: ['Juho Esimerkki'] });
    const b = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ a: a.volume, b: b.volume });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('a', 400), candidate('b', 400)],
        reader
      )
    ).toMatchObject({ confirmed: false, reason: 'ambiguous', volumeId: 'a' });
  });
});

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

  test('stays in the numbering that starts over, near the Anchors', async () => {
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

  test('matches a Doubled volume in the copy the Anchors point into', async () => {
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
