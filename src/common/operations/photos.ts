// The operations on a dataset's Photos: listing them, deleting one, and
// tagging people in them. Adding one from disk sends its file, not JSON,
// so it's a route of its own (POST /d/<slug>/api/addPhoto, a form with
// its `file`).

import type { Box, PhotoRow } from '@/common/types';

import { answers, asksNothing } from './operation';
import { boxOf, isId } from './read';

interface InPhoto {
  photoId: number;
  personId: number;
}

function inPhotoOf(photoId: unknown, personId: unknown): InPhoto | null {
  return isId(photoId) && isId(personId) ? { photoId, personId } : null;
}

export const PHOTO_OPERATIONS = {
  // Every Photo of the dataset, those no one is linked to or tagged in
  // first, then as the import listed them.
  photos: asksNothing<PhotoRow[]>(),

  // Deletes a Photo, its links and its file.
  deletePhoto: answers<{ photoId: number }, undefined>(
    '{ photoId }',
    ({ photoId }) => (isId(photoId) ? { photoId } : null)
  ),

  // Tags the person in the Photo at `box`, or moves their Tag there; the
  // Photo as it is now.
  tag: answers<InPhoto & { box: Box }, PhotoRow>(
    '{ photoId, personId, box }',
    ({ photoId, personId, box }) => {
      const at = inPhotoOf(photoId, personId);
      const read = boxOf(box);
      return at === null || read === null ? null : { ...at, box: read };
    }
  ),

  // Takes back the person's Tag in the Photo; the Photo as it is now.
  untag: answers<InPhoto, PhotoRow>(
    '{ photoId, personId }',
    ({ photoId, personId }) => inPhotoOf(photoId, personId)
  ),

  // Makes the Photo the person's portrait, cropped to their Tag's Box;
  // the Photo as it is now.
  choosePortrait: answers<InPhoto, PhotoRow>(
    '{ photoId, personId }',
    ({ photoId, personId }) => inPhotoOf(photoId, personId)
  )
};
