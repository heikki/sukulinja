import { describe, expect, test } from 'bun:test';

import { parseChurchBookRef } from '@/server/citations/myheritage/record';

import { baptisms, BOX, candidate, DAY, fakeReader, iso } from './fake-reader';
import { matchRef } from './matcher';
import type { Person } from './reader';

// A baptism index citation in MyHeritage's shape, for a made-up person.
function baptism(name: string, date: string) {
  return parseChurchBookRef(
    'https://www.myheritage.fi/research/collection-30233/x?itemId=7',
    `${name}\nRistiäiset: ${date} - Pitäjä, Lääni, Finland\nIsä: Matti Esimerkki`
  );
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

  test("leaves a match for review when the Reader can't say where the entry is", async () => {
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { reader } = fakeReader({ b: volume });
    const boxless = {
      ...reader,
      findEntry: async (...args: Parameters<typeof reader.findEntry>) => {
        const entry = await reader.findEntry(...args);
        return 'unreadable' in entry ? entry : { ...entry, box: null };
      }
    };
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        boxless
      )
    ).toEqual({
      confirmed: false,
      reason: 'no box',
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

  test("doesn't follow a date outside the Volume's years", async () => {
    // Image 100 (September 1822) misread as 1839, after the Volume ends.
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { dates } = volume;
    const { reader } = fakeReader({
      b: {
        ...volume,
        dates: (image) =>
          image === 100
            ? {
                earliest: '1839-07-04',
                latest: '1839-10-19',
                register: 'baptisms'
              }
            : dates(image)
      }
    });
    const years = { from: 1820, to: 1830 };
    expect(
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [{ ...candidate('b', images), years }],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 137 });
  });

  test('steps past another register, such as marriages ahead of the baptisms', async () => {
    // Images 1–20 are marriages from 1820 to 1822; the baptisms follow,
    // Image n holding ten days from 1820-01-01 + 10 (n - 21) days.
    const start = Date.UTC(1820, 0, 1);
    const { reader } = fakeReader({
      b: {
        dates: (image) =>
          image <= 20
            ? {
                earliest: '1820-01-01',
                latest: '1822-12-31',
                register: 'marriages'
              }
            : {
                earliest: iso(start + (image - 21) * 10 * DAY),
                latest: iso(start + ((image - 21) * 10 + 9) * DAY),
                register: 'baptisms'
              },
        names: { 25: ['Juho Esimerkki'] }
      }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', '15. Helmi 1820'),
        [candidate('b', 60)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 25 });
  });

  test('leaves out a stretch of another register between the probe and the cited one', async () => {
    // Marriages on Images 1–20, deaths on 21–60, then the baptisms, Image n
    // holding ten days from 1820-01-01 + 10 (n - 61) days. Re-probing the
    // deaths step by step would spend the search's reads.
    const start = Date.UTC(1820, 0, 1);
    const { reader } = fakeReader({
      b: {
        dates: (image) => {
          if (image <= 20) {
            const year = { earliest: '1820-01-01', latest: '1820-06-30' };
            return { ...year, register: 'marriages' };
          }
          if (image <= 60) {
            return { earliest: '', latest: '', register: 'other' };
          }
          return {
            earliest: iso(start + (image - 61) * 10 * DAY),
            latest: iso(start + ((image - 61) * 10 + 9) * DAY),
            register: 'baptisms'
          };
        },
        names: { 64: ['Juho Esimerkki'] }
      }
    });
    expect(
      await matchRef(
        baptism('Juho Esimerkki', '5. Helmi 1820'),
        [candidate('b', 100)],
        reader
      )
    ).toMatchObject({ confirmed: true, image: 64 });
  });

  test("doesn't stop on a range of more than a year", async () => {
    // Image 100 (September 1822) misread as running into 1825, over the
    // cited date.
    const { volume, images } = baptisms(400, { 137: ['Juho Esimerkki'] });
    const { dates } = volume;
    const { reader } = fakeReader({
      b: {
        ...volume,
        dates: (image) =>
          image === 100
            ? {
                earliest: '1822-09-07',
                latest: '1825-12-07',
                register: 'baptisms'
              }
            : dates(image)
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

  test("asks about a parent's citation with the people the entry names", async () => {
    const { volume, images } = baptisms(400, { 137: ['Matti Esimerkki'] });
    const { reader } = fakeReader({ b: volume });
    const asked: Person[] = [];
    const { findEntry } = reader;
    reader.findEntry = async (at, person) => {
      asked.push(person);
      return await findEntry(at, person);
    };
    const parent = parseChurchBookRef(
      'https://www.myheritage.fi/research/collection-30233/x?itemId=7',
      `Matti Esimerkki\nRistiäiset: ${CITED} - Pitäjä, Lääni, Finland\nIsä: Matti Esimerkki\nÄiti: Liisa Malli\nLapsi: Juho Esimerkki`
    );
    await matchRef(parent, [candidate('b', images)], reader);
    expect(asked[0]).toEqual({
      name: 'Matti Esimerkki',
      date: '1823-09-27',
      village: null,
      household: null,
      named: [
        { relation: 'father', name: 'Matti Esimerkki' },
        { relation: 'mother', name: 'Liisa Malli' },
        { relation: 'child', name: 'Juho Esimerkki' }
      ]
    });
  });
});

describe('the date written for the entry', () => {
  function written(dates: Record<number, Record<string, string | null>>) {
    const names = Object.fromEntries(
      Object.entries(dates).map(([image, byName]) => [
        image,
        Object.keys(byName)
      ])
    );
    const { volume, images } = baptisms(400, names);
    const { reader } = fakeReader({ b: { ...volume, written: dates } });
    return async () =>
      await matchRef(
        baptism('Juho Esimerkki', CITED),
        [candidate('b', images)],
        reader
      );
  }

  test('confirms an entry written within days of the cited date', async () => {
    const match = written({ 137: { 'Juho Esimerkki': '1823-09-29' } });
    expect(await match()).toMatchObject({ confirmed: true, image: 137 });
  });

  test("doesn't confirm one written months away, or with no date read", async () => {
    for (const date of ['1823-03-02', null]) {
      const match = written({ 137: { 'Juho Esimerkki': date } });
      // eslint-disable-next-line no-await-in-loop -- one Volume at a time
      expect(await match()).toMatchObject({
        confirmed: false,
        reason: 'name not found'
      });
    }
  });

  test('passes a namesake months away for the entry beside it', async () => {
    const match = written({
      138: { 'Juho Esimerkki': '1824-01-10' },
      136: { 'Juho Esimerkki': '1823-09-20' }
    });
    expect(await match()).toMatchObject({ confirmed: true, image: 136 });
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
