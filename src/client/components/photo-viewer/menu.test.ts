import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openPhotoViewer } from '@/client/state/photo-viewer';
import { openSelected } from '@/client/state/selected';

import { photoItems } from './menu';

const BOX = { left: 1, top: 2, width: 3, height: 4 };

function viewer() {
  const api = memoryDatasetApi({});
  const photos = openPhotoViewer(api, openSelected(api));
  photos.open({
    id: 11,
    path: 'b.jpg',
    people: [{ personId: 3, box: BOX, tagged: true }]
  });
  return photos;
}

function labels(
  photos: ReturnType<typeof viewer>,
  where: { onPending?: boolean; onTag?: number | null; canTag?: boolean }
) {
  return photoItems(
    photos,
    { onPending: false, onTag: null, canTag: true, ...where },
    { tag: () => undefined }
  ).map((i) => i.label);
}

test('offers a new Tag on the Photo once it shows, and a Tag its own', () => {
  const photos = viewer();
  expect(labels(photos, {})).toEqual(['New tag for…']);
  expect(labels(photos, { canTag: false })).toEqual([]);
  expect(labels(photos, { onTag: 3 })).toEqual(['Move tag', 'Remove tag']);
});

test('with a Tag pending, only its Box offers to discard it', () => {
  const photos = viewer();
  photos.tagFor(4, BOX);
  expect(labels(photos, {})).toEqual([]);
  expect(labels(photos, { onTag: 3 })).toEqual([]);
  expect(labels(photos, { onPending: true })).toEqual(['Discard changes']);
});
