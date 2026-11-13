// Editing an Entry from its Box in the Scan viewer (ADR-0026): its people,
// what it says and its Box changed at once in the card it was made in, and
// the whole Entry deleted.

import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type {
  CitationRow,
  Link,
  PersonDetails,
  VolumeCitation
} from '@/common/types';

import { openAppState } from './';

const BOX = { left: 100, top: 200, width: 500, height: 50 };
const LINK: Link = {
  volumeId: '201',
  volume: 'I C:1 Syntyneiden ja kastettujen luettelot',
  url: '',
  precision: 'entry',
  image: 20,
  box: BOX,
  certainty: 'marked'
};

function inEntry(id: number, role: string): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    record: null,
    text: 'Kaste 1.2.1790',
    churchBook: true,
    madeInApp: true,
    markKey: 'entry 7',
    citedPage: null,
    cited: null,
    supports: [],
    entryId: 7,
    role
  };
}

function person(id: number, citations: CitationRow[]): PersonDetails {
  return {
    id,
    name: `Person ${id}`,
    sex: 'U',
    facts: [],
    marriages: [],
    citations,
    photos: []
  };
}

const CHILD = inEntry(11, 'CHIL');
const MOTHER = inEntry(12, 'MOTH');

// The child selected, open on their Citation of the Entry, which names
// their mother too.
async function viewing() {
  const rows: VolumeCitation[] = [
    { personId: 1, citation: CHILD, link: LINK },
    { personId: 2, citation: MOTHER, link: LINK }
  ];
  const api = memoryDatasetApi({
    details: { 1: person(1, [CHILD]), 2: person(2, [MOTHER]) },
    links: { 1: [{ citationId: 11, links: [LINK] }] },
    marks: { 11: { citationId: 11, links: [LINK] } },
    volumes: { '201': { images: 40, citations: rows } }
  });
  const state = openAppState(api);
  state.chart.select(1);
  await Bun.sleep(0);
  state.viewer.open({ citation: CHILD, link: LINK });
  await Bun.sleep(0);
  return { api, viewer: state.viewer };
}

test('editing starts from the Entry as it is, and Cancel leaves it so', async () => {
  const { api, viewer } = await viewing();
  viewer.editEntry();
  expect(viewer.pending.get()?.cite).toMatchObject({
    people: [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ],
    text: 'Kaste 1.2.1790',
    editing: { entryId: 7 }
  });
  expect(viewer.boxPending.get()).toBe(true);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()?.citation.id).toBe(11);
  expect(api.asked.some((a) => a.startsWith('transcribe'))).toBe(false);
});

test('one Save adds, takes out, says and moves, and stays on the source', async () => {
  const { api, viewer } = await viewing();
  viewer.editEntry();
  viewer.setInEntry({ personId: 3, role: 'MOTH' });
  viewer.setInEntry({ personId: 4, role: 'FATH' });
  viewer.setCiteText('Kaste 2.2.1790');
  const moved = { ...BOX, top: 260 };
  viewer.setBox(moved);
  expect(await viewer.save()).toBeNull();
  const done = api.asked.filter((a) =>
    /^(?:mark|transcribe|add to entry|uncite)/.test(a)
  );
  expect(done).toEqual([
    'mark 11 201/20 box',
    'transcribe 7: Kaste 2.2.1790',
    'add to entry 7: 3 as MOTH',
    'add to entry 7: 4 as FATH',
    'uncite 12'
  ]);
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()).toMatchObject({
    citation: { id: 11 },
    link: { box: moved }
  });
  expect(viewer.entry.people.get().map((r) => r.personId)).toEqual([1, 3, 4]);
});

test("taking the source's own person out leaves the viewer on the Image", async () => {
  const { api, viewer } = await viewing();
  viewer.editEntry();
  viewer.dropFromEntry(1);
  await viewer.save();
  expect(api.asked).toContain('uncite 11');
  expect(api.asked).not.toContain('mark 11 201/20 box');
  expect(viewer.source.get()).toBeNull();
  expect(viewer.opened.get()).toEqual({
    volumeId: '201',
    volume: LINK.volume,
    image: 20
  });
});

test('an edit naming no one is refused', async () => {
  const { viewer } = await viewing();
  viewer.editEntry();
  viewer.dropFromEntry(1);
  viewer.dropFromEntry(2);
  const refused = await viewer.save().catch((err: unknown) => err);
  expect(refused).toMatchObject({ message: 'Name someone in the entry.' });
});

test('deleting the Box of an Entry with others in it deletes the Entry', async () => {
  const { api, viewer } = await viewing();
  viewer.discard();
  await viewer.confirmDiscard();
  expect(api.asked).toContain('delete entry 7');
  expect(api.asked).not.toContain('uncite 11');
  expect(viewer.source.get()).toBeNull();
});
