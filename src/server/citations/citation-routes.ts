// The routes of a dataset's Citations: a person's Links, a Mark or Discard
// on one, the Volumes it can be put in, a Volume's Citations, how many link
// into each of a parish's Volumes, making or deleting one in the app, the
// Facts one supports, and switching a Volume to Astia's new filming.
// The routes read the request; the handlers answer it.

import type { Box, LinkResolution } from '@/common/types';

import { astiaFailed } from './astia-routes';
import type { Citations, CiteTarget, EntryTarget, InEntry } from './citations';
import type { BoxAt, MarkTarget } from './references';

interface CitationHandlers {
  handlePersonLinks: (id: number) => Response;
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleDiscard: (id: number, at: BoxAt) => Promise<Response>;
  handleVolumeChoices: (id: number) => Promise<Response>;
  handleVolumeCitations: (volumeId: string) => Promise<Response>;
  handleArchiveCitations: (archiveId: string) => Promise<Response>;
  handleArchives: () => Promise<Response>;
  handleVolume: (volumeId: string) => Promise<Response>;
  handleCite: (personId: number, target: CiteTarget) => Promise<Response>;
  handleCiteEntry: (
    target: EntryTarget,
    people: InEntry[]
  ) => Promise<Response>;
  handleAddToEntry: (entryId: number, person: InEntry) => Promise<Response>;
  handleTranscribe: (entryId: number, text: string | null) => Response;
  handleDeleteEntry: (entryId: number) => Response;
  handleUncite: (id: number) => Response;
  handleSupport: (id: number, factId: number, on: boolean) => Response;
  handleSwitchFilming: (volumeId: string, volume: string) => Promise<Response>;
}

// Switches a Volume, `volume` by its label, to Astia's new filming: its
// Images' viewer URLs.
type SwitchFilming = (volumeId: string, volume: string) => Promise<string[]>;

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

// An optional string of a request's body: the string, null when it's left
// out or null, undefined when it's anything else.
function optionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

type Body = Record<string, unknown> | null;

async function readBody(req: Request) {
  return (await req.json().catch(() => null)) as Body;
}

// `{ volumeId, image, fileId, box, text? }` of a body: an entry to cite.
// Null for anything else.
function entryOf(body: Body): EntryTarget | null {
  const { volumeId, image, fileId, box } = body ?? {};
  if (typeof volumeId !== 'string' || typeof image !== 'number') return null;
  if (typeof fileId !== 'string') return null;
  const text = optionalString(body?.text);
  if (text === undefined) return null;
  const drawn = readBox(box);
  if (drawn === null) return null;
  return { volumeId, image, fileId, box: drawn, text };
}

// `{ personId, role? }`: someone named in an entry. Null for anything else.
function inEntryOf(value: unknown): InEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { personId, role } = value as Record<string, unknown>;
  if (typeof personId !== 'number') return null;
  const named = optionalString(role);
  return named === undefined ? null : { personId, role: named };
}

// `{ volumeId, image, fileId, box, text?, role? }`: an entry to cite for
// one person. Anything else is rejected.
async function readCite(req: Request): Promise<CiteTarget | null> {
  const body = await readBody(req);
  const entry = entryOf(body);
  const role = optionalString(body?.role);
  if (entry === null || role === undefined) return null;
  return { ...entry, role };
}

// The entry and `people: [{ personId, role? }]` of an entry to make.
// Anything else is rejected.
async function readEntry(req: Request) {
  const body = await readBody(req);
  const entry = entryOf(body);
  if (entry === null || !Array.isArray(body?.people)) return null;
  const people = body.people.map(inEntryOf);
  if (people.some((p) => p === null)) return null;
  return { entry, people: people as InEntry[] };
}

// A Volume, its /citations, and POST its /filming; null for any other
// path.
async function routeVolume(
  req: Request,
  handlers: CitationHandlers,
  rest: string
) {
  const volume =
    /^\/api\/volumes\/(?<id>[^/]+)(?:\/(?<part>citations|filming))?$/.exec(
      rest
    );
  if (volume === null) return null;
  const { id, part } = volume.groups!;
  if (part === 'filming') return await routeFilming(req, handlers, id!);
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return part === undefined
    ? await handlers.handleVolume(id!)
    : await handlers.handleVolumeCitations(id!);
}

// POST `{ volume }`, the Volume's label, to switch it to the new filming.
async function routeFilming(
  req: Request,
  handlers: CitationHandlers,
  volumeId: string
) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const body = (await req.json().catch(() => null)) as {
    volume?: unknown;
  } | null;
  return typeof body?.volume === 'string'
    ? await handlers.handleSwitchFilming(volumeId, body.volume)
    : new Response('expected { volume }', { status: 400 });
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

// PUT `{ text }` to an Entry, or DELETE it with its Citations.
async function routeEntry(
  req: Request,
  handlers: CitationHandlers,
  id: number
) {
  if (req.method === 'DELETE') return handlers.handleDeleteEntry(id);
  if (req.method !== 'PUT') {
    return new Response('method not allowed', { status: 405 });
  }
  const text = optionalString((await readBody(req))?.text);
  return text === undefined
    ? new Response('expected { text }', { status: 400 })
    : handlers.handleTranscribe(id, text);
}

// POST /api/entries makes an Entry with its people; PUT or DELETE
// /api/entries/:id changes what one says or deletes it; POST
// /api/entries/:id/people adds someone to one (ADR-0026). Null for any
// other path.
async function routeEntries(
  req: Request,
  handlers: CitationHandlers,
  rest: string
) {
  const at = /^\/api\/entries(?:\/(?<id>\d+)(?<people>\/people)?)?$/.exec(rest);
  if (at === null) return null;
  const id = at.groups?.id;
  if (id !== undefined && at.groups?.people === undefined) {
    return await routeEntry(req, handlers, Number(id));
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  if (id === undefined) {
    const made = await readEntry(req);
    return made === null
      ? new Response(
          'expected { volumeId, image, fileId, box, text?, people: [{ personId, role? }] }',
          { status: 400 }
        )
      : await handlers.handleCiteEntry(made.entry, made.people);
  }
  const person = inEntryOf(await readBody(req));
  return person === null
    ? new Response('expected { personId, role? }', { status: 400 })
    : await handlers.handleAddToEntry(Number(id), person);
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

// GET /api/archives, and an archive's /citations; null for any other path.
async function routeArchives(
  req: Request,
  handlers: CitationHandlers,
  rest: string
) {
  const archive = /^\/api\/archives(?:\/(?<id>\d+)\/citations)?$/.exec(rest);
  if (archive === null) return null;
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const id = archive.groups?.id;
  return id === undefined
    ? await handlers.handleArchives()
    : await handlers.handleArchiveCitations(id);
}

// PUT or DELETE /api/citations/:id/supports/:factId; null for another path.
function routeSupport(req: Request, handlers: CitationHandlers, rest: string) {
  const supports =
    /^\/api\/citations\/(?<id>\d+)\/supports\/(?<fact>\d+)$/.exec(rest);
  if (supports === null) return null;
  const { id, fact } = supports.groups!;
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    return new Response('method not allowed', { status: 405 });
  }
  return handlers.handleSupport(Number(id), Number(fact), req.method === 'PUT');
}

// GET /api/persons/:id/scans streams the person's Links; POST
// /api/persons/:id/citations makes a Citation; /api/entries and its
// Entries (routeEntries); DELETE /api/citations/:id
// deletes one; PUT or DELETE /api/citations/:id/supports/:factId makes it
// support a Fact or no longer; a Citation's `/scans` and `/volumes`; GET
// /api/volumes/:id and its `/citations`, and POST its `/filming`; GET
// /api/archives and /api/archives/:id/citations. Null for any other path.
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
  const entries = await routeEntries(req, handlers, rest);
  if (entries !== null) return entries;
  const volume = await routeVolume(req, handlers, rest);
  if (volume !== null) return volume;
  const archives = await routeArchives(req, handlers, rest);
  if (archives !== null) return archives;
  const made = /^\/api\/citations\/(?<id>\d+)$/.exec(rest);
  if (made !== null) {
    return req.method === 'DELETE'
      ? handlers.handleUncite(Number(made.groups!.id))
      : new Response('method not allowed', { status: 405 });
  }
  const supports = routeSupport(req, handlers, rest);
  if (supports !== null) return supports;
  const citation =
    /^\/api\/citations\/(?<id>\d+)\/(?<part>scans|volumes)$/.exec(rest);
  if (citation === null) return null;
  const { id, part } = citation.groups!;
  return await routeCitation(req, handlers, Number(id), part!);
}

// What was made, as made (201), or why not.
function answerMade(
  made: Response | object | { rejected: string } | null,
  missing: string
) {
  if (made instanceof Response) return made;
  if (made === null) return new Response(missing, { status: 404 });
  return 'rejected' in made
    ? new Response(made.rejected, { status: 400 })
    : Response.json(made, { status: 201 });
}

// A reference's links as a Mark or Discard left them, or why not.
function answerLinks(
  id: number,
  result:
    Response | { resolution: LinkResolution } | { rejected: string } | null
) {
  if (result instanceof Response) return result;
  if (result === null) {
    return new Response('citation not found', { status: 404 });
  }
  return 'rejected' in result
    ? new Response(result.rejected, { status: 400 })
    : Response.json({ citationId: id, ...result.resolution });
}

function citationHandlers(
  citations: Citations,
  switchFilming: SwitchFilming
): CitationHandlers {
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

    async handleArchiveCitations(archiveId) {
      try {
        return Response.json(await citations.countInArchive(archiveId));
      } catch (err) {
        return astiaFailed(err);
      }
    },

    async handleArchives() {
      try {
        return Response.json(await citations.churchBookArchives());
      } catch (err) {
        return astiaFailed(err);
      }
    },

    async handleVolume(volumeId) {
      try {
        return Response.json(await citations.contentsOf(volumeId));
      } catch (err) {
        return astiaFailed(err);
      }
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

    async handleCiteEntry(target, people) {
      const made = await citations.citeEntry(target, people).catch(astiaFailed);
      return answerMade(made, 'person not found');
    },

    async handleAddToEntry(entryId, person) {
      const made = await citations
        .addToEntry(entryId, person)
        .catch(astiaFailed);
      return answerMade(made, 'entry or person not found');
    },

    handleTranscribe(entryId, text) {
      const now = citations.transcribe(entryId, text);
      return now === null
        ? new Response('entry not found', { status: 404 })
        : Response.json(now);
    },

    handleDeleteEntry(entryId) {
      const removed = citations.deleteEntry(entryId);
      return removed === null
        ? new Response('entry not found', { status: 404 })
        : Response.json({ removed });
    },

    handleUncite(id) {
      const removed = citations.uncite(id);
      return removed === null
        ? new Response('citation not found', { status: 404 })
        : new Response(null, { status: 204 });
    },

    handleSupport(id, factId, on) {
      const citation = citations.support(id, factId, on);
      return citation === null
        ? new Response('citation or fact not found', { status: 404 })
        : Response.json(citation);
    },

    async handleSwitchFilming(volumeId, volume) {
      const urls = await switchFilming(volumeId, volume).catch(astiaFailed);
      return urls instanceof Response ? urls : Response.json(urls);
    }
  };
}

// The routes of the dataset's Citations; each answers null for a path that
// isn't one of them.
export function citationRoutes(
  citations: Citations,
  switchFilming: SwitchFilming
) {
  const handlers = citationHandlers(citations, switchFilming);
  return async (req: Request, rest: string) =>
    await routeCitations(req, handlers, rest);
}
