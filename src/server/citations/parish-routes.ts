// The routes of the install's parishes, shared by every dataset: listing
// them, finding a parish's archive in Astia, and choosing one, for a
// spelling references give or for none.

import type { ChurchBookArchive } from '@/common/types';

import { astiaFailed } from './astia-routes';
import type { Astia } from './astia/astia';
import { findParishArchives, isParishArchive } from './astia/parish-search';
import type { Parishes } from './astia/parishes';

interface Sources {
  astia: Astia;
  parishes: Parishes;
}

const ARCHIVE_ID = /^\d+$/u;

// Every parish, by its archive's title in Astia (its id when Astia can't
// say).
async function listParishes({ astia, parishes }: Sources) {
  const all = await Promise.all(
    parishes.archives().map(async (archiveId): Promise<ChurchBookArchive> => ({
      archiveId,
      title: (await astia.archiveTitle(archiveId)) ?? archiveId
    }))
  );
  return Response.json(all);
}

async function search({ astia }: Sources, req: Request) {
  const name = new URL(req.url).searchParams.get('q') ?? '';
  const found = await findParishArchives(astia, name).catch(astiaFailed);
  return found instanceof Response ? found : Response.json(found);
}

// What's asked to be chosen, if it's a parish's archive in Astia: why not
// otherwise.
async function chosen(
  { astia }: Sources,
  req: Request
): Promise<{ archiveId: string; spelling: unknown } | Response> {
  const body = (await req.json().catch(() => null)) as {
    archiveId?: unknown;
    spelling?: unknown;
  } | null;
  const archiveId = body?.archiveId;
  if (typeof archiveId !== 'string' || !ARCHIVE_ID.test(archiveId)) {
    return new Response('An archive id is needed.', { status: 400 });
  }
  const title = await astia.archiveTitle(archiveId);
  if (title === null) {
    return new Response("Astia couldn't say what that archive is.", {
      status: 502
    });
  }
  if (!isParishArchive(title)) {
    return new Response(`${title} isn't a parish's archive.`, {
      status: 400
    });
  }
  return { archiveId, spelling: body?.spelling };
}

// POST /parishes adds an archive, with no spelling.
async function add(sources: Sources, req: Request) {
  const asked = await chosen(sources, req);
  if (asked instanceof Response) return asked;
  await sources.parishes.add(asked.archiveId);
  return new Response(null, { status: 204 });
}

// POST /parishes/spellings links a spelling into an archive: every
// reference giving it then resolves there.
async function link(sources: Sources, req: Request) {
  const asked = await chosen(sources, req);
  if (asked instanceof Response) return asked;
  const { spelling, archiveId } = asked;
  if (typeof spelling !== 'string' || spelling.trim() === '') {
    return new Response('A spelling is needed.', { status: 400 });
  }
  await sources.parishes.link(spelling, archiveId);
  return new Response(null, { status: 204 });
}

type Handler = (sources: Sources, req: Request) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/parishes': { GET: listParishes, POST: add },
  '/parishes/search': { GET: search },
  '/parishes/spellings': { POST: link }
};

// GET /parishes lists them and POST adds one; GET /parishes/search?q=
// finds archives; POST /parishes/spellings links a spelling. Null for any
// other path.
export async function routeParishes(
  sources: Sources,
  req: Request,
  pathname: string
) {
  const route = ROUTES[pathname];
  if (route === undefined) return null;
  const handle = route[req.method];
  if (handle === undefined) {
    return new Response('method not allowed', { status: 405 });
  }
  return await handle(sources, req);
}
