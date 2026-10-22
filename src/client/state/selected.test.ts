import { expect, test } from 'bun:test';

import { ApiError } from '@client/dataset-api';
import { memoryDatasetApi } from '@client/dataset-api/memory';
import type {
  CitationLinks,
  CitationRow,
  Link,
  PersonDetails
} from '@common/types';

import { openSelected } from './selected';

function churchBook(id: number, citedPage: number | null): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    url: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey: `citation ${id}`,
    citedPage,
    cited: null
  };
}

function person(id: number, citations: CitationRow[]): PersonDetails {
  return { id, name: `Person ${id}`, sex: 'U', facts: [], citations };
}

function marked(volumeId: string, image: number): Link {
  return {
    volumeId,
    volume: 'I Aa:5',
    url: '',
    archive: 'Juvan seurakunnan arkisto',
    precision: 'image',
    image,
    certainty: 'marked'
  };
}

const ON_18 = marked('201', 18);
const ON_19 = marked('201', 19);

// Matti's references 11 and 12 (12 cited first in the Volume), and Maria's
// 21.
const MATTI = person(1, [churchBook(11, 40), churchBook(12, 30)]);
const MARIA = person(2, [churchBook(21, null)]);
const MATTI_11: CitationLinks = { citationId: 11, links: [ON_18] };
const MATTI_12: CitationLinks = { citationId: 12, unlinked: 'not-digitized' };
const MARIA_21: CitationLinks = { citationId: 21, links: [ON_18] };
// Marking 12 on Image 19 links it.
const MARKED_12: CitationLinks = { citationId: 12, links: [ON_19] };

function dataset() {
  return memoryDatasetApi({
    details: { 1: MATTI, 2: MARIA },
    links: { 1: [MATTI_11, MATTI_12], 2: [MARIA_21] },
    marks: { 12: MARKED_12 }
  });
}

// Every answer the memory API has in hand, given.
async function settle() {
  await Bun.sleep(0);
}

// One microtask at a time, until `ready`.
async function until(ready: () => boolean) {
  for (let turn = 0; turn < 100 && !ready(); turn++) {
    // eslint-disable-next-line no-await-in-loop -- a turn at a time
    await Promise.resolve();
  }
  expect(ready()).toBe(true);
}

test('select loads the details, then the Links', async () => {
  const api = dataset();
  const selected = openSelected(api);
  const done = selected.select(1);
  expect(selected.id.get()).toBe(1);
  await done;
  expect(api.asked).toEqual(['person 1', 'links 1']);
  expect(selected.details.get()).toBe(MATTI);
  expect([...selected.links.get()]).toEqual([
    [11, { links: [ON_18] }],
    [12, { unlinked: 'not-digitized' }]
  ]);
  expect(selected.pending.get()).toBe(false);
});

test('selecting the person already selected does nothing', async () => {
  const api = dataset();
  const selected = openSelected(api);
  await selected.select(1);
  await selected.select(1);
  expect(api.asked).toEqual(['person 1', 'links 1']);
});

test("selecting again before the first answer drops the first person's", async () => {
  const api = dataset();
  const selected = openSelected(api);
  await Promise.all([selected.select(1), selected.select(2)]);
  expect(api.asked).toEqual(['person 1', 'person 2', 'links 2']);
  expect(selected.details.get()).toBe(MARIA);
  expect([...selected.links.get().keys()]).toEqual([21]);
});

test("the details stay until the next person's arrive", async () => {
  const selected = openSelected(dataset());
  await selected.select(1);
  const next = selected.select(2);
  expect(selected.id.get()).toBe(2);
  expect(selected.details.get()).toBe(MATTI);
  await next;
  expect(selected.details.get()).toBe(MARIA);
});

test("an unknown person gives the app's words", async () => {
  const selected = openSelected(dataset());
  await selected.select(1);
  await selected.select(9);
  expect(selected.error.get()).toBe('person not found');
  await selected.select(2);
  expect(selected.error.get()).toBe(null);
});

test("the sources are in the panel's order, with link statuses", async () => {
  const selected = openSelected(dataset());
  const loading = selected.select(1);
  await until(() => selected.details.get() !== null);
  // Shown with their Links, not before.
  const sources = selected.sources.get().map((g) => ({
    label: g.label,
    rows: g.sources.map((s) => [s.citation.id, s.status?.label])
  }));
  expect(sources).toEqual([
    { label: 'Juvan seurakunnan arkisto', rows: [[11, 'Marked Image']] },
    { label: 'Church books', rows: [[12, 'Not found']] }
  ]);
  await loading;
});

test('Links still streaming after the grace show the details, and arrive after', async () => {
  const api = dataset();
  const held = Promise.withResolvers<undefined>();
  const slow = {
    ...api,
    async *personLinks(id: number, signal?: AbortSignal) {
      await held.promise;
      yield* api.personLinks(id, signal);
    }
  };
  const selected = openSelected(slow, { grace: 0 });
  const loading = selected.select(1);
  // Past the grace, timed from the details' answer.
  await Bun.sleep(10);
  expect(selected.details.get()).toBe(MATTI);
  expect(selected.pending.get()).toBe(true);
  const finding = selected.sources.get()[0]?.sources[0]?.status?.label;
  expect(finding).toBe('Finding scan…');
  held.resolve(undefined);
  await loading;
  expect(selected.pending.get()).toBe(false);
  expect([...selected.links.get().keys()]).toEqual([11, 12]);
});

test("mark saves, sets the reference's Links, and reloads the others keeping the known", async () => {
  const data = {
    details: { 1: MATTI },
    links: { 1: [MATTI_11, MATTI_12] },
    marks: { 12: MARKED_12 }
  };
  const api = memoryDatasetApi(data);
  const selected = openSelected(api);
  await selected.select(1);
  // What the server answers once the Mark is saved.
  data.links[1] = [MATTI_11, MARKED_12];
  const resolved = await selected.mark(12, { volumeId: '201', image: 19 });
  expect(resolved).toBe(MARKED_12);
  expect(api.asked).toEqual([
    'person 1',
    'links 1',
    'mark 12 201/19',
    'links 1'
  ]);
  expect(selected.pending.get()).toBe(true);
  expect([...selected.links.get()]).toEqual([
    [11, { links: [ON_18] }],
    [12, { links: [ON_19] }]
  ]);
  await settle();
  expect(selected.pending.get()).toBe(false);
  // Both in the Volume now, by page.
  const rows = selected.sources
    .get()
    .map((g) => g.sources.map((s) => s.citation.id));
  expect(rows).toEqual([[12, 11]]);
});

test("a refused Mark throws in the server's words", async () => {
  const selected = openSelected(dataset());
  await selected.select(1);
  const refused = await selected
    .mark(11, { volumeId: '201', image: 2 })
    .then(() => null)
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).message).toBe('citation not found');
  expect(selected.links.get().get(11)).toEqual({ links: [ON_18] });
});
