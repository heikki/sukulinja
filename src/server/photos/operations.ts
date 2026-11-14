// The operations on a dataset's Photos (common/operations/photos),
// answered by its Photos and Tags; and adding a picture from disk, whose
// file a form sends.

import type { PHOTO_OPERATIONS } from '@/common/operations/photos';

import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import type { PhotoFiles, PhotoRefused } from './files';
import type { Photos } from './photos';
import type { TagRefused, Tags } from './tags';

// The answer, or a Refusal thrown: 404 for what's missing.
function done<T extends object>(result: T | TagRefused | PhotoRefused) {
  if (!('refused' in result)) return result;
  throw new Refusal(result.missing ? 404 : 400, result.refused);
}

export function photoOperations({
  photos,
  tags,
  photoFiles
}: {
  photos: Photos;
  tags: Tags;
  photoFiles: PhotoFiles;
}): Handlers<typeof PHOTO_OPERATIONS> {
  return {
    photos: () => photos.all(),
    async deletePhoto({ photoId }) {
      done(await photoFiles.remove(photoId));
    },
    tag: ({ photoId, personId, box }) => done(tags.tag(photoId, personId, box)),
    untag: ({ photoId, personId }) => done(tags.untag(photoId, personId)),
    choosePortrait: ({ photoId, personId }) =>
      done(tags.choosePortrait(photoId, personId))
  };
}

// POST /api/addPhoto, a form with its `file`: the picture added as a
// Photo linked to no one, or the one the dataset has of the same file.
// Null for any other path.
export async function routeAddPhoto(
  req: Request,
  photoFiles: PhotoFiles,
  rest: string
) {
  if (rest !== '/api/addPhoto') return null;
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.name === '') {
    return new Response('expected a file', { status: 400 });
  }
  const added = await photoFiles.add(
    file.name,
    new Uint8Array(await file.arrayBuffer())
  );
  return 'refused' in added
    ? new Response(added.refused, { status: added.missing ? 404 : 400 })
    : Response.json(added);
}
