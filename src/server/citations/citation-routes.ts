// The routes of a dataset's Citations: a person's Links, a Mark or Discard
// on one, the Volumes it can be put in, a Volume's Citations, and making or
// deleting one in the app. The routes read the request; the handlers answer
// it.

import type { Box, LinkResolution } from '@/common/types';

import { astiaFailed } from './astia-routes';
import type { Citations, CiteTarget } from './citations';
import type { BoxAt, MarkTarget } from './myheritage';

interface CitationHandlers {
  handlePersonLinks: (id: number) => Response;
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleDiscard: (id: number, at: BoxAt) => Promise<Response>;
  handleVolumeChoices: (id: number) => Promise<Response>;
  handleVolumeCitations: (volumeId: string) => Promise<Response>;
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

// GET /api/persons/:id/scans streams the person's Links; POST
// /api/persons/:id/citations makes a Citation; DELETE /api/citations/:id
// deletes one made in the app; a Citation's `/scans` and `/volumes`; and GET
// /api/volumes/:id/citations. Null for any other path.
async function routeCitations(
  req: Request,
  handlers: CitationHandlers,
  rest: string
) {
  const person = /^\/api\/persons\/(?<id>\d+)\/(?<part>scans|citations)$/.exec(
    rest
  );
  if (person !== null) {
    const personId = Number(person.groups!.id);
    return person.groups!.part === 'scans'
      ? handlers.handlePersonLinks(personId)
      : await routeCite(req, handlers, personId);
  }
  const volume = /^\/api\/volumes\/(?<id>[^/]+)\/citations$/.exec(rest);
  if (volume !== null) {
    return await handlers.handleVolumeCitations(volume.groups!.id!);
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

// A reference's links as a Mark or Discard left them, or why not.
function answerLinks(
  id: number,
  result: Response | LinkResolution | { rejected: string } | null
) {
  if (result instanceof Response) return result;
  if (result === null) {
    return new Response('citation not found', { status: 404 });
  }
  return 'rejected' in result
    ? new Response(result.rejected, { status: 400 })
    : Response.json({ citationId: id, ...result });
}

function citationHandlers(citations: Citations): CitationHandlers {
  return {
    // One line per church-book citation as its Links resolve. Astia is slow
    // and throttled, so a person's citations share one streamed request
    // rather than holding a connection each.
    handlePersonLinks(id) {
      const lines = citations.linksOf(id);
      const enc = new TextEncoder();
      // A cancelled stream lets the resolutions under way finish, unread.
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const next = await lines.next();
          if (next.done === true) {
            controller.close();
          } else {
            controller.enqueue(enc.encode(`${JSON.stringify(next.value)}\n`));
          }
        },
        cancel() {
          void lines.return(undefined);
        }
      });
      return new Response(stream, {
        headers: { 'content-type': 'application/x-ndjson' }
      });
    },

    async handleMark(id, target) {
      return answerLinks(
        id,
        await citations.mark(id, target).catch(astiaFailed)
      );
    },

    async handleDiscard(id, at) {
      return answerLinks(
        id,
        await citations.discard(id, at).catch(astiaFailed)
      );
    },

    async handleVolumeChoices(id) {
      const choices = await citations.volumeChoices(id).catch(astiaFailed);
      if (choices instanceof Response) return choices;
      return choices === null
        ? new Response('citation not found', { status: 404 })
        : Response.json(choices);
    },

    async handleVolumeCitations(volumeId) {
      try {
        const rows = await citations.inVolume(volumeId);
        return rows === null
          ? new Response("volume not in the dataset's parishes", {
              status: 404
            })
          : Response.json(rows);
      } catch (err) {
        return astiaFailed(err);
      }
    },

    async handleCite(personId, target) {
      const made = await citations.cite(personId, target).catch(astiaFailed);
      if (made instanceof Response) return made;
      if (made === null) {
        return new Response('person not found', { status: 404 });
      }
      return 'rejected' in made
        ? new Response(made.rejected, { status: 400 })
        : Response.json(made, { status: 201 });
    },

    handleUncite(id) {
      const removed = citations.uncite(id);
      if (removed === null) {
        return new Response('citation not found', { status: 404 });
      }
      return removed
        ? new Response(null, { status: 204 })
        : new Response('Only a Citation made in the app can be deleted.', {
            status: 400
          });
    }
  };
}

// The routes of the dataset's Citations; each answers null for a path that
// isn't one of them.
export function citationRoutes(citations: Citations) {
  const handlers = citationHandlers(citations);
  return async (req: Request, rest: string) =>
    await routeCitations(req, handlers, rest);
}
