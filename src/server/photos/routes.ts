// The routes of a dataset's Photos: GET /api/photos lists every Photo, as
// the Photos view shows them, POST adds a picture from disk (a form with
// its `file`), answering it as an AddedPhoto, and DELETE /api/photos/:id
// deletes one with its file, answering who was on it; PUT /api/photos/:id/tags/:personId with
// `{ box }` tags the person there or moves their Tag, DELETE takes it
// back, and PUT …/:personId/portrait makes the Photo their portrait, each
// answering the Photo as it is now. Null for any other path.

import type { AddedPhoto, Box, PhotoRow } from '@/common/types';

import type { PhotoFiles } from './files';
import type { Photos } from './photos';
import type { TagRefused, Tags } from './tags';

const PHOTO_RE = /^\/api\/photos\/(?<photo>\d+)$/u;
const TAG_RE =
  /^\/api\/photos\/(?<photo>\d+)\/tags\/(?<person>\d+)(?<portrait>\/portrait)?$/u;

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

function answer(
  result: PhotoRow | AddedPhoto | number[] | TagRefused,
  status = 200
): Response {
  if (!('refused' in result)) return Response.json(result, { status });
  return new Response(result.refused, { status: result.missing ? 404 : 400 });
}

// The picture a form sends, by its file name.
async function readFile(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.name === '') return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function routeAdd(req: Request, files: PhotoFiles) {
  if (req.method === 'GET') return null;
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const file = await readFile(req);
  if (file === null) return new Response('expected a file', { status: 400 });
  const added = await files.add(file.name, file.bytes);
  return answer(added, 'refused' in added || added.already ? 200 : 201);
}

async function routeTag(req: Request, tags: Tags, rest: string) {
  const m = TAG_RE.exec(rest);
  if (m === null) return null;
  const photoId = Number(m.groups!.photo);
  const personId = Number(m.groups!.person);
  if (m.groups!.portrait !== undefined) {
    return req.method === 'PUT'
      ? answer(tags.choosePortrait(photoId, personId))
      : new Response('method not allowed', { status: 405 });
  }
  if (req.method === 'DELETE') return answer(tags.untag(photoId, personId));
  if (req.method !== 'PUT') {
    return new Response('method not allowed', { status: 405 });
  }
  const box = readBox(await req.json().catch(() => null));
  return box === null
    ? new Response('expected { box }', { status: 400 })
    : answer(tags.tag(photoId, personId, box));
}

export async function routePhotos(
  req: Request,
  {
    photos,
    tags,
    photoFiles
  }: { photos: Photos; tags: Tags; photoFiles: PhotoFiles },
  rest: string
) {
  if (rest === '/api/photos') {
    return (await routeAdd(req, photoFiles)) ?? Response.json(photos.all());
  }
  const one = PHOTO_RE.exec(rest);
  if (one !== null) {
    return req.method === 'DELETE'
      ? answer(await photoFiles.remove(Number(one.groups!.photo)))
      : new Response('method not allowed', { status: 405 });
  }
  return await routeTag(req, tags, rest);
}
