import { basename, join, relative, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import { slugFromFilename, withoutExtension } from '@common/slug';
import type { Box, LinkResolution } from '@common/types';

import {
  AstiaError,
  NoImageError,
  openAstia,
  viewerUrls
} from './citation-scans/astia';
import type { Astia } from './citation-scans/astia';
import { openMarks } from './citation-scans/marks';
import { openPins, openVolumeFacts } from './citation-scans/pins';
import type { BoxAt, MarkTarget } from './citation-scans/pins';
import type { ImageRef } from './citation-scans/reader';
import { routeRescan } from './citation-scans/rescans';
import type { KeptPins } from './citation-scans/rescans';
import {
  imageSize,
  openScanCache,
  routeScanCache
} from './citation-scans/scan-cache';
import type { ScanCache } from './citation-scans/scan-cache';
import { openScans } from './citation-scans/scans';
import type { Scans } from './citation-scans/scans';
import { createCitations } from './citations';
import type { DatasetRegistry } from './dataset-registry';
import { saveExport } from './export-dataset';
import { importDataset } from './import-dataset';
import { createPersonDetails } from './person-details';
import { createTree } from './tree';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;
const ASTIA_RE =
  /^\/astia\/volumes\/(?<volumeId>\d+)\/(?:images(?:\/(?<n>\d+))?|(?<rescan>rescan))$/u;

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers {
  handlePersons: () => Response;
  handleFamilies: () => Response;
  handlePerson: (id: number) => Response;
  handlePersonLinks: (id: number) => Response;
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleDiscard: (id: number, at: BoxAt) => Promise<Response>;
  handleVolumeChoices: (id: number) => Promise<Response>;
  handleVolumeCitations: (volumeId: string) => Promise<Response>;
  handleMedia: (rest: string, mediaRoot: string) => Promise<Response>;
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

function createDatasetHandlers(db: Database, scans: Scans): DatasetHandlers {
  const tree = createTree(db);
  const citations = createCitations(db, scans);
  const personDetails = createPersonDetails(db, citations);

  return {
    handlePersons() {
      return Response.json(tree.persons());
    },

    handleFamilies() {
      return Response.json(tree.families());
    },

    handlePerson(id) {
      const details = personDetails(id);
      return details === null
        ? new Response('person not found', { status: 404 })
        : Response.json(details);
    },

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

    async handleMedia(rest, mediaRoot) {
      const rel = decodeURIComponent(rest.slice('/media/'.length));
      const fullPath = resolve(mediaRoot, rel);
      if (relative(mediaRoot, fullPath).startsWith('..')) {
        return new Response('forbidden', { status: 403 });
      }
      const file = Bun.file(fullPath);
      if (!(await file.exists())) {
        return new Response('not found', { status: 404 });
      }
      return new Response(file);
    }
  };
}

// What an upload holds, by its extension: a GEDZIP, or a GEDCOM's text.
async function importSource(file: File) {
  if (/\.gdz$/iu.test(file.name)) return { gedzip: await file.bytes() };
  if (/\.ged(?:com)?$/iu.test(file.name)) return { gedcom: await file.text() };
  return null;
}

async function handleImport(
  req: Request,
  registry: DatasetRegistry
): Promise<Response> {
  const form = await req.formData().catch(() => null);
  if (form === null) {
    return new Response('expected multipart/form-data', { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response('missing file field', { status: 400 });
  }
  const nameField = form.get('name');
  const rawName =
    typeof nameField === 'string' && nameField.trim() !== ''
      ? nameField.trim()
      : file.name;
  const source = await importSource(file);
  if (source === null) {
    return new Response('expected a .ged, .gedcom or .gdz file', {
      status: 400
    });
  }
  // Keep the readable name (accents/casing) for display; the slug is derived.
  const displayName = withoutExtension(rawName).trim();
  const slug = slugFromFilename(rawName);
  const sourceFilename = file.name;

  // Stream the import as newline-delimited JSON: a series of {type:'log'}
  // progress lines, then a terminal {type:'done', info} or {type:'error'}.
  // Headers are already sent by the time the import runs, so failures surface
  // as an error event in the body rather than an HTTP status.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      function send(event: unknown): void {
        controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
      }
      try {
        const outcome = await importDataset({
          registry,
          slug,
          displayName,
          source,
          sourceFilename,
          log: (message) => {
            send({ type: 'log', message });
          }
        });
        send({ type: 'done', info: outcome.info });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'import failed';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson' }
  });
}

async function handleDeleteDataset(
  registry: DatasetRegistry,
  slug: string
): Promise<Response> {
  try {
    const existed = await registry.delete(slug);
    return existed
      ? new Response(null, { status: 204 })
      : new Response('dataset not found', { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'delete failed';
    return new Response(message, { status: 400 });
  }
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

// POST a Mark, DELETE a Box.
async function routeMark(req: Request, handlers: DatasetHandlers, id: number) {
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
  handlers: DatasetHandlers,
  id: number,
  part: string
) {
  if (part === 'scans') return await routeMark(req, handlers, id);
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return await handlers.handleVolumeChoices(id);
}

async function routeDataset(
  req: Request,
  handlers: DatasetHandlers,
  rest: string,
  mediaRoot: string
): Promise<Response | null> {
  if (rest === '/api/persons') return handlers.handlePersons();
  if (rest === '/api/families') return handlers.handleFamilies();
  const person = /^\/api\/persons\/(?<id>\d+)(?<scans>\/scans)?$/.exec(rest);
  if (person !== null) {
    const id = Number(person.groups!.id);
    return person.groups!.scans === undefined
      ? handlers.handlePerson(id)
      : handlers.handlePersonLinks(id);
  }
  const citation =
    /^\/api\/citations\/(?<id>\d+)\/(?<part>scans|volumes)$/.exec(rest);
  if (citation !== null) {
    const { id, part } = citation.groups!;
    return await routeCitation(req, handlers, Number(id), part!);
  }
  const volume = /^\/api\/volumes\/(?<id>[^/]+)\/citations$/.exec(rest);
  if (volume !== null) {
    return await handlers.handleVolumeCitations(volume.groups!.id!);
  }
  if (rest.startsWith('/media/')) {
    return await handlers.handleMedia(rest, mediaRoot);
  }
  return null;
}

// What the routes outside any dataset read: Astia, the Scan cache its
// Images are kept in, and the pins every dataset made on them.
interface Shared {
  astia: Astia;
  cache: ScanCache;
  kept: () => Promise<KeptPins>;
}

// An Astia Volume's Images, shared by every dataset: their Astia viewer
// URLs in order, or one Image itself; or Astia's re-scan of the Volume.
async function routeAstia(shared: Shared, req: Request, pathname: string) {
  const m = ASTIA_RE.exec(pathname);
  if (m === null) return null;
  const { astia, cache } = shared;
  const { volumeId, n, rescan } = m.groups!;
  if (rescan !== undefined) {
    return await routeRescan(shared, req, volumeId!).catch(astiaFailed);
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return n === undefined
    ? await handleViewerUrls(astia, volumeId!)
    : await handleAstiaImage(cache, req, {
        volumeId: volumeId!,
        image: Number(n)
      });
}

async function handleViewerUrls(astia: Astia, volumeId: string) {
  const urls = await viewerUrls(astia, volumeId).catch(astiaFailed);
  return urls instanceof Response ? urls : Response.json(urls);
}

// A request to Astia failing answers 502, in words the Scan viewer can
// show; anything else thrown is a bug, and is thrown on.
function astiaFailed(err: unknown) {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  if (!(err instanceof AstiaError)) throw err;
  return new Response("Astia couldn't be reached or gave no answer.", {
    status: 502
  });
}

// `?size=thumb` gives the 250px one. The webview keeps it by its file id,
// asking each time: a re-scan puts another photograph at the same number.
async function handleAstiaImage(cache: ScanCache, req: Request, at: ImageRef) {
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';
  const size = thumb ? 'thumb' : 'full';
  // null: the Volume has no such Image. A request given up as its client
  // left gets the same answer as Astia failing; no one reads it.
  const path = await cache
    .image(at, size, req.signal)
    .catch((err: unknown) =>
      err instanceof NoImageError
        ? new Response('Astia no longer has this Image.', { status: 410 })
        : astiaFailed(req.signal.aborted ? new AstiaError('client left') : err)
    );
  if (path instanceof Response) return path;
  if (path === null) return new Response('image not found', { status: 404 });
  const etag = `"${basename(path, '.jpg')}"`;
  const headers = { 'Cache-Control': 'no-cache', 'ETag': etag };
  if (req.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(Bun.file(path), {
    headers: { ...headers, 'Content-Type': 'image/jpeg' }
  });
}

// Routes outside any dataset, shared by them all: Astia's Images and the
// cache they're kept in.
async function routeShared(shared: Shared, req: Request, pathname: string) {
  if (pathname === '/settings/scan-cache') {
    return await routeScanCache(shared.cache, req);
  }
  return await routeAstia(shared, req, pathname);
}

export interface ApiOptions {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string;
}

const EXPORT_RE = /^\/datasets\/(?<slug>[^/]+)\/export$/u;

async function handleExport(
  registry: DatasetRegistry,
  slug: string,
  dir: string | undefined
) {
  try {
    return Response.json({ path: await saveExport(registry, slug, dir) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export failed';
    return new Response(message, { status: 400 });
  }
}

export function createApi(
  registry: DatasetRegistry,
  options: ApiOptions = {}
): ApiHandlers {
  const astia = options.astia ?? openAstia(join(registry.root, '.astia-cache'));
  const cache = openScanCache({
    astia,
    root: registry.root,
    switches: false
  });
  const facts = openVolumeFacts(registry.root, { astia });
  // Kept by the Database they're bound to: the registry alone decides when
  // a dataset's Database is closed and replaced (by an import or a delete),
  // and the next request then opens the new one and gets new handlers.
  const handlersByDb = new WeakMap<Database, DatasetHandlers>();

  function pinsOf(db: Database) {
    return openPins(facts, openMarks(db));
  }

  // The pins on Astia's Images: the data folder's, and every dataset's
  // Marks, which a switch to a new filming leaves out alike.
  async function kept() {
    const { shipped, local } = await facts.kept();
    const marked = (await registry.list())
      .filter((d) => !d.outdated)
      .flatMap((d) => {
        const db = tryOpen(d.slug);
        return db === null ? [] : [pinsOf(db).marked()];
      });
    return { shipped, local: [local, ...marked] };
  }

  function tryOpen(slug: string): Database | null {
    try {
      return registry.open(slug);
    } catch {
      return null;
    }
  }

  function getHandlers(slug: string): DatasetHandlers | null {
    const db = tryOpen(slug);
    if (db === null) return null;
    let handlers = handlersByDb.get(db);
    if (handlers === undefined) {
      // The Scan viewer has just shown the Image a Box is drawn on.
      const scans = openScans({
        pins: pinsOf(db),
        astia,
        sizeOf: async (at) => await imageSize(cache, at)
      });
      handlers = createDatasetHandlers(db, scans);
      handlersByDb.set(db, handlers);
    }
    return handlers;
  }

  // The list of datasets, and deleting or exporting one.
  async function routeDatasets(req: Request, pathname: string) {
    if (pathname === '/datasets') {
      return Response.json(await registry.list());
    }
    const exporting = EXPORT_RE.exec(pathname);
    if (exporting !== null) {
      if (req.method !== 'POST') {
        return new Response('method not allowed', { status: 405 });
      }
      const slug = exporting.groups!.slug!;
      return await handleExport(registry, slug, options.exportDir);
    }
    if (pathname.startsWith('/datasets/')) {
      if (req.method !== 'DELETE') {
        return new Response('method not allowed', { status: 405 });
      }
      const slug = pathname.slice('/datasets/'.length);
      return await handleDeleteDataset(registry, slug);
    }
    return null;
  }

  return {
    async routeApi(req, pathname) {
      if (pathname === '/import') {
        if (req.method !== 'POST') {
          return new Response('method not allowed', { status: 405 });
        }
        return await handleImport(req, registry);
      }
      const datasets = await routeDatasets(req, pathname);
      if (datasets !== null) return datasets;
      const shared = await routeShared({ astia, cache, kept }, req, pathname);
      if (shared !== null) return shared;
      const m = DATASET_RE.exec(pathname);
      if (m === null) return null;
      const slug = m.groups!.slug!;
      const rest = m.groups!.rest ?? '/';
      const handlers = getHandlers(slug);
      if (handlers === null) {
        return new Response('dataset not found', { status: 404 });
      }
      return await routeDataset(req, handlers, rest, registry.mediaDir(slug));
    }
  };
}

interface StaticFetchConfig {
  api: ApiHandlers;
  staticRoots: string[];
}

export function createStaticFetch(
  config: StaticFetchConfig
): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    const api = await config.api.routeApi(req, url.pathname);
    if (api !== null) return api;

    let path = decodeURIComponent(url.pathname);
    const m = DATASET_RE.exec(path);
    if (m !== null) path = m.groups!.rest ?? '/';
    // index.html links its assets relatively, so the page at /d/<slug> asks
    // for them one level up, as /d/<asset>.
    else if (path.startsWith('/d/')) path = path.slice('/d'.length);
    if (path === '/') path = '/index.html';
    for (const root of config.staticRoots) {
      const file = Bun.file(`${root}${path}`);
      if (file.size > 0) return new Response(file);
    }
    return new Response('Not Found', { status: 404 });
  };
}
