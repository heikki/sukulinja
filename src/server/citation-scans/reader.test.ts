import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { cachedReader } from './reader';
import type { Reader } from './reader';

let dir = '';
// Questions the fake Reader was asked, in order.
let asked: string[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'readings-'));
  asked = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A Volume whose Image n carries page n + 2, with Liisa Malli on Image 4.
function fakeReader(model: string): Reader {
  return {
    models: { pages: model, dates: model, entry: model },
    pageNumbers: async ({ image }) => {
      asked.push(`pages ${image}`);
      return await Promise.resolve(
        image === 9 ? { unreadable: true } : { pages: [image + 2] }
      );
    },
    dates: async ({ image }) => {
      asked.push(`dates ${image}`);
      return await Promise.resolve({
        earliest: `1829-0${image}-01`,
        latest: `1829-0${image}-28`,
        register: 'baptisms' as const
      });
    },
    findEntry: async ({ image }, person) => {
      asked.push(`entry ${image} ${person.name}`);
      const found = image === 4 && person.name === 'Liisa Malli';
      return await Promise.resolve({ found, confidence: found ? 0.9 : 0.8 });
    }
  };
}

async function readAll(reader: Reader) {
  const at = { volumeId: 'v', image: 4 };
  return [
    await reader.pageNumbers(at),
    await reader.pageNumbers({ volumeId: 'v', image: 9 }),
    await reader.dates(at),
    await reader.findEntry(at, { name: 'Liisa Malli' }),
    await reader.findEntry(at, { name: 'Matti Esimerkki', date: '1829' })
  ];
}

test('a re-run gives the same readings without asking again', async () => {
  const first = await readAll(cachedReader(fakeReader('m1'), dir));
  expect(first).toEqual([
    { pages: [6] },
    { unreadable: true },
    { earliest: '1829-04-01', latest: '1829-04-28', register: 'baptisms' },
    { found: true, confidence: 0.9 },
    { found: false, confidence: 0.8 }
  ]);
  expect(asked).toHaveLength(5);

  asked = [];
  expect(await readAll(cachedReader(fakeReader('m1'), dir))).toEqual(first);
  expect(asked).toEqual([]);
});

test('another model, or another person asked about, reads again', async () => {
  await readAll(cachedReader(fakeReader('m1'), dir));
  asked = [];
  await readAll(cachedReader(fakeReader('m2'), dir));
  expect(asked).toHaveLength(5);

  asked = [];
  const reader = cachedReader(fakeReader('m1'), dir);
  await reader.findEntry({ volumeId: 'v', image: 4 }, { name: 'Anna Malli' });
  expect(asked).toEqual(['entry 4 Anna Malli']);
});

test('a question asked differently reads again; the others stay cached', async () => {
  await readAll(cachedReader(fakeReader('m1'), dir));
  asked = [];
  await readAll(
    cachedReader({ ...fakeReader('m1'), versions: { entry: '2' } }, dir)
  );
  expect(asked).toEqual(['entry 4 Liisa Malli', 'entry 4 Matti Esimerkki']);
});
