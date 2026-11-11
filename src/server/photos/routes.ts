// The routes of a dataset's Photos: GET /api/photos lists every Photo, as
// the Photos view shows them; PUT /api/photos/:id/tags/:personId with
// `{ box }` tags the person there or moves their Tag, DELETE takes it
// back, each answering the Photo as it is now. Null for any other path.

import type { Box, PhotoRow } from '@/common/types';

import type { Photos } from './photos';
import type { TagRefused, Tags } from './tags';

const TAG_RE = /^\/api\/photos\/(?<photo>\d+)\/tags\/(?<person>\d+)$/u;

function readBox(body: unknown): Box | null {
  if (typeof body !== 'object' || body === null) return null;
  const { box } = body as { box?: unknown };
  if (typeof box !== 'object' || box === null) return null;
  const { left, top, width, height } = box as Record<string, unknown>;
  if (
    typeof left !== 'number' ||
    typeof top !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null;
  }
  const read: Box = { left, top, width, height };
  return read;
}

function answer(result: PhotoRow | TagRefused) {
  if (!('refused' in result)) return Response.json(result);
  return new Response(result.refused, { status: result.missing ? 404 : 400 });
}

export async function routePhotos(
  req: Request,
  { photos, tags }: { photos: Photos; tags: Tags },
  rest: string
) {
  if (rest === '/api/photos') {
    return req.method === 'GET'
      ? Response.json(photos.all())
      : new Response('method not allowed', { status: 405 });
  }
  const m = TAG_RE.exec(rest);
  if (m === null) return null;
  const photoId = Number(m.groups!.photo);
  const personId = Number(m.groups!.person);
  if (req.method === 'DELETE') return answer(tags.untag(photoId, personId));
  if (req.method !== 'PUT') {
    return new Response('method not allowed', { status: 405 });
  }
  const box = readBox(await req.json().catch(() => null));
  return box === null
    ? new Response('expected { box }', { status: 400 })
    : answer(tags.tag(photoId, personId, box));
}
