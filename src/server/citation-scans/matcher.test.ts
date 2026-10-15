import { describe, expect, test } from 'bun:test';

import { matchRef } from './matcher';
import type { Candidate } from './matcher';
import type { DatesReading, Reader } from './reader';
import { parseChurchBookRef } from './record';

const DAY = 24 * 60 * 60 * 1000;

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A scripted Volume: what each Image's dates read as, and who is on it.
interface Volume {
  dates: (image: number) => DatesReading;
  names: Record<number, string[]>;
  // Images whose writing is too faint to find anyone on.
  faint?: Set<number>;
}

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
    pageNumbers: async () => await Promise.resolve({ unreadable: true }),
    dates: async ({ volumeId, image }) => {
      asked.push(`dates ${volumeId} ${image}`);
      return await Promise.resolve(volumes[volumeId]!.dates(image));
    },
    findEntry: async ({ volumeId, image }, { name }) => {
      asked.push(`entry ${volumeId} ${image}`);
      const v = volumes[volumeId]!;
      if (v.faint?.has(image) === true) {
        return await Promise.resolve({ unreadable: true });
      }
      const found = (v.names[image] ?? []).includes(name);
      return await Promise.resolve({ found, confidence: 0.9 });
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
      image: 137
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
    const dates = volume.dates;
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
    const dates = volume.dates;
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
    const dates = volume.dates;
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
