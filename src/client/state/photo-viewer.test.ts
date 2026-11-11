import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { PersonDetails, PhotoRow } from '@/common/types';

import { openPhotoViewer } from './photo-viewer';
import { openSelected } from './selected';

const BOX = { left: 1, top: 2, width: 3, height: 4 };
const PORTRAIT: PhotoRow = {
  id: 10,
  path: 'a.jpg',
  people: [{ personId: 1, box: null }]
};
const GROUP: PhotoRow = {
  id: 11,
  path: 'b.jpg',
  people: [
    { personId: 1, box: BOX },
    { personId: 2, box: BOX }
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
  return openPhotoViewer(selected);
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
