// The routes of a dataset's Citations: a Mark or Discard on one, the
// Volumes it can be put in, and making or deleting one in the app. They
// read the request; the handlers answer it.

import type { Box } from '@common/types';

import type { BoxAt, MarkTarget } from './citation-scans/pins';
import type { CiteTarget } from './citations';

export interface CitationHandlers {
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleDiscard: (id: number, at: BoxAt) => Promise<Response>;
  handleVolumeChoices: (id: number) => Promise<Response>;
  handleCite: (personId: number, target: CiteTarget) => Promise<Response>;
  handleUncite: (id: number) => Response;
}

// A Box's four numbers, or null for one that isn't.
function readBox(value: unknown): Box | null {
  if (typeof value !== 'object' || value === null) return null;
  const { left, top, width, height } = value as Record<string, unknown>;
  if (typeof left !== 'number' || typeof top !== 'number') return null;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  const box: Box = { left, top, width, height };
  return box;
}

// `{ volumeId, image, box? }`, or `{ volumeId }` for only the Volume; `box`
// null for none. Anything else is rejected.
async function readMark(req: Request): Promise<MarkTarget | null> {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (typeof body?.volumeId !== 'string') return null;
  const { volumeId, image, box } = body;
  if (image === undefined) return box === undefined ? { volumeId } : null;
  if (typeof image !== 'number') return null;
  if (box === undefined || box === null) return { volumeId, image, box };
  const drawn = readBox(box);
  return drawn === null ? null : { volumeId, image, box: drawn };
}

// `{ volumeId, image }`: where a Box is. Anything else is rejected.
async function readBoxAt(req: Request): Promise<BoxAt | null> {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const { volumeId, image } = body ?? {};
  if (typeof volumeId !== 'string' || typeof image !== 'number') return null;
  return { volumeId, image };
}

// `{ volumeId, image, fileId, box, text? }`: an entry to cite. Anything
// else is rejected.
async function readCite(req: Request): Promise<CiteTarget | null> {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const { volumeId, image, fileId, box, text } = body ?? {};
  if (typeof volumeId !== 'string' || typeof image !== 'number') return null;
  if (typeof fileId !== 'string') return null;
  if (text !== undefined && text !== null && typeof text !== 'string') {
    return null;
  }
  const drawn = readBox(box);
  if (drawn === null) return null;
  return { volumeId, image, fileId, box: drawn, text: text ?? null };
}

// POST a Citation of an entry for the person.
async function routeCite(
  req: Request,
  handlers: CitationHandlers,
  personId: number
) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const target = await readCite(req);
  return target === null
    ? new Response('expected { volumeId, image, fileId, box, text? }', {
        status: 400
      })
    : await handlers.handleCite(personId, target);
}

// POST a Mark, DELETE a Box.
async function routeMark(req: Request, handlers: CitationHandlers, id: number) {
  if (req.method === 'DELETE') {
    const at = await readBoxAt(req);
    return at === null
      ? new Response('expected { volumeId, image }', { status: 400 })
      : await handlers.handleDiscard(id, at);
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const target = await readMark(req);
  return target === null
    ? new Response('expected { volumeId, image?, box? }', { status: 400 })
    : await handlers.handleMark(id, target);
}

// GET a citation's `/volumes`; POST its `/scans` (a Mark), or DELETE its
// Box there (a Discard).
async function routeCitation(
  req: Request,
  handlers: CitationHandlers,
  id: number,
  part: string
) {
  if (part === 'scans') return await routeMark(req, handlers, id);
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return await handlers.handleVolumeChoices(id);
}

// POST /api/persons/:id/citations makes a Citation; DELETE
// /api/citations/:id deletes one made in the app; and a Citation's
// `/scans` and `/volumes`. Null for any other path.
export async function routeCitations(
  req: Request,
  handlers: CitationHandlers,
  rest: string
) {
  const person = /^\/api\/persons\/(?<id>\d+)\/citations$/.exec(rest);
  if (person !== null) {
    return await routeCite(req, handlers, Number(person.groups!.id));
  }
  const made = /^\/api\/citations\/(?<id>\d+)$/.exec(rest);
  if (made !== null) {
    return req.method === 'DELETE'
      ? handlers.handleUncite(Number(made.groups!.id))
      : new Response('method not allowed', { status: 405 });
  }
  const citation =
    /^\/api\/citations\/(?<id>\d+)\/(?<part>scans|volumes)$/.exec(rest);
  if (citation === null) return null;
  const { id, part } = citation.groups!;
  return await routeCitation(req, handlers, Number(id), part!);
}
