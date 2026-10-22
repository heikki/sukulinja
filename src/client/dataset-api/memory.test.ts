import { expect, test } from 'bun:test';

import type {
  CitationLinks,
  PersonDetails,
  PersonRow,
  VolumeCitation
} from '@/common/types';

import { ApiError, NOT_RESPONDING } from '.';
import { memoryDatasetApi } from './memory';

const MATTI: PersonRow = {
  id: 1,
  given: 'Matti',
  surname: 'Esimerkki',
  sex: 'M',
  birth_year: null,
  death_year: null,
  birth_date: null,
  death_date: null,
  died: false,
  photo_path: null,
  crop: null
};
const DETAILS: PersonDetails = {
  id: 1,
  name: 'Matti Esimerkki',
  sex: 'M',
  facts: [],
  citations: []
};
const ROWS: VolumeCitation[] = [];
const UNLINKED: CitationLinks = { citationId: 7, unlinked: 'no-volume' };
const MARKED: CitationLinks = { citationId: 7, links: [] };

function dataset() {
  return memoryDatasetApi({
    persons: [MATTI],
    details: { 1: DETAILS },
    links: { 1: [UNLINKED] },
    volumes: { '201': { images: 3, citations: ROWS } },
    marks: { 7: MARKED }
  });
}

// What the call failed with; it must fail. An ApiError gives its words.
async function failure(call: Promise<unknown>) {
  return await call
    .then(() => 'succeeded')
    .catch((err: unknown) => (err instanceof ApiError ? err.message : err));
}

test('answers what it was given, and records what was asked', async () => {
  const api = dataset();
  expect(await api.persons()).toEqual([MATTI]);
  expect(await api.families()).toEqual([]);
  expect(await api.person(1)).toBe(DETAILS);
  const lines = [];
  for await (const line of api.personLinks(1)) lines.push(line);
  expect(lines).toEqual([UNLINKED]);
  expect(await api.mark(7, { volumeId: '201', image: 2 })).toBe(MARKED);
  expect(await api.volumeCitations('201')).toBe(ROWS);
  expect(await api.volumeImages('201')).toHaveLength(3);
  expect(api.asked).toEqual([
    'persons',
    'families',
    'person 1',
    'links 1',
    'mark 7 201/2',
    'citations 201',
    'images 201'
  ]);
});

test("fails in the server's words for what it wasn't given", async () => {
  const api = dataset();
  expect(await failure(api.person(2))).toBe('person not found');
  expect(await failure(api.mark(8, { volumeId: '201', image: 1 }))).toBe(
    'citation not found'
  );
  expect(await failure(api.volumeImages('202'))).toBe(
    "volume not in the dataset's parishes"
  );
});

test('fails every call when down', async () => {
  const api = memoryDatasetApi({ persons: [MATTI] }, { down: true });
  expect(await failure(api.persons())).toBe(NOT_RESPONDING);
  expect(await failure(api.personLinks(1).next())).toBe(NOT_RESPONDING);
});

test('rejects with the reason once aborted', async () => {
  const api = dataset();
  const reason = new Error('superseded');
  expect(await failure(api.persons(AbortSignal.abort(reason)))).toBe(reason);
});

test('rejects with the reason when aborted after asking, even once answered', async () => {
  const api = dataset();
  const abort = new AbortController();
  const reason = new Error('superseded');
  const asked = api.person(1, abort.signal);
  abort.abort(reason);
  expect(await failure(asked)).toBe(reason);
});
