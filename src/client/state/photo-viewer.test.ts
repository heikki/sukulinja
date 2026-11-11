import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { PersonDetails, PhotoRow } from '@/common/types';

import { openPhotoViewer } from './photo-viewer';
import { openSelected } from './selected';

const BOX = { left: 1, top: 2, width: 3, height: 4 };
const PORTRAIT: PhotoRow = {
  id: 10,
  path: 'a.jpg',
  people: [{ personId: 1, box: null, tagged: false }]
};
const GROUP: PhotoRow = {
  id: 11,
  path: 'b.jpg',
  people: [
    { personId: 1, box: BOX, tagged: false },
    { personId: 2, box: BOX, tagged: false }
  ]
};

function person(id: number, photos: PhotoRow[]): PersonDetails {
  return { id, name: null, sex: null, facts: [], citations: [], photos };
}

async function opened() {
  const api = memoryDatasetApi({
    details: { 1: person(1, [PORTRAIT, GROUP]), 2: person(2, [GROUP]) }
  });
  const selected = openSelected(api, { grace: 0 });
  await selected.select(1);
  return openPhotoViewer(api, selected);
}

test("steps through the Selected person's Photos, stopping at the ends", async () => {
  const photos = await opened();
  photos.open(PORTRAIT);
  photos.step(-1);
  expect(photos.opened.get()).toBe(PORTRAIT);
  photos.step(1);
  expect(photos.opened.get()).toBe(GROUP);
  photos.step(1);
  expect(photos.opened.get()).toBe(GROUP);
});

test('stays open for someone in the Photo, and closes for anyone else', async () => {
  const photos = await opened();
  photos.open(GROUP);
  photos.selected(2);
  expect(photos.opened.get()).toBe(GROUP);
  photos.selected(3);
  expect(photos.opened.get()).toBeNull();
});

// The viewer on the group photo, over a dataset that can tag in it.
async function tagging() {
  const group = structuredClone(GROUP);
  const api = memoryDatasetApi({
    details: { 1: person(1, [PORTRAIT, group]), 2: person(2, [group]) },
    photos: { 11: structuredClone(group) }
  });
  const selected = openSelected(api, { grace: 0 });
  await selected.select(1);
  const tagged: number[] = [];
  const photos = openPhotoViewer(api, selected, {
    tagged: (id) => {
      tagged.push(id);
    }
  });
  photos.open(group);
  return { api, photos, tagged };
}

const MOVED = { left: 5, top: 6, width: 7, height: 8 };

test('tags someone: the Box pending, then saved, and the Photo as saved', async () => {
  const { api, photos, tagged } = await tagging();
  photos.tagFor(3, BOX);
  photos.setBox(MOVED);
  expect(photos.pending.get()).toEqual({
    personId: 3,
    box: MOVED,
    moving: false
  });
  photos.step(-1);
  expect(photos.opened.get()?.id).toBe(11);
  await photos.save();
  expect(api.asked).toContain('tag 11 3');
  expect(photos.pending.get()).toBeNull();
  expect(photos.opened.get()?.people.at(-1)).toEqual({
    personId: 3,
    box: MOVED,
    tagged: true
  });
  expect(tagged).toEqual([3]);
});

test("moves a Tag from its Box, but not the import's", async () => {
  const { photos } = await tagging();
  photos.tagFor(3, BOX);
  await photos.save();
  photos.move(2);
  expect(photos.pending.get()).toBeNull();
  photos.move(3);
  expect(photos.pending.get()).toEqual({ personId: 3, box: BOX, moving: true });
  photos.cancel();
  expect(photos.pending.get()).toBeNull();
});

test('takes back a Tag once confirmed', async () => {
  const { api, photos } = await tagging();
  photos.tagFor(3, BOX);
  await photos.save();
  photos.untag(2);
  expect(photos.removing.get()).toBeNull();
  photos.untag(3);
  expect(photos.removing.get()).toBe(3);
  await photos.save();
  expect(api.asked).toContain('untag 11 3');
  expect(photos.removing.get()).toBeNull();
  expect(photos.opened.get()?.people.map((p) => p.personId)).toEqual([1, 2]);
});

test("a refused Tag stays pending, with the app's words", async () => {
  const { photos } = await tagging();
  photos.tagFor(2, BOX);
  expect(photos.save()).rejects.toThrow(
    "They're marked on this photo already."
  );
  await Promise.resolve();
  expect(photos.pending.get()?.personId).toBe(2);
});
