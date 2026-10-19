import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import { openAstia, viewerUrls } from './citation-scans/astia';
import type { Astia } from './citation-scans/astia';
import { astiaImage } from './citation-scans/images';
import { openPins } from './citation-scans/pins';
import type { MarkTarget } from './citation-scans/pins';
import type { ImageRef } from './citation-scans/reader';
import { routeScanCache } from './citation-scans/scan-cache';
import { openScans, useDataFolder } from './citation-scans/scans';
import type { Scans } from './citation-scans/scans';
import { createCitations } from './citations';
import type { DatasetRegistry } from './dataset-registry';
import { importDataset, slugFromFilename } from './import-dataset';
import { createPersonDetails } from './person-details';
import { runPool } from './pool';
import { createTree } from './tree';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;
const ASTIA_RE =
  /^\/astia\/volumes\/(?<volumeId>\d+)\/images(?:\/(?<n>\d+))?$/u;

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers {
  handlePersons: () => Response;
  handleFamilies: () => Response;
  handlePerson: (id: number) => Response;
  handlePersonLinks: (id: number) => Response;
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleVolumeCitations: (volumeId: string) => Promise<Response>;
  handleMedia: (rest: string, mediaRoot: string) => Promise<Response>;
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
      const result = await citations.mark(id, target);
      if (result === null) {
        return new Response('citation not found', { status: 404 });
      }
      return 'rejected' in result
        ? new Response(result.rejected, { status: 400 })
        : Response.json({ citationId: id, ...result });
    },

    async handleVolumeCitations(volumeId) {
      try {
        const rows = await citations.inVolume(volumeId);
        return rows === null
          ? new Response("volume not in the dataset's parishes", {
              status: 404
            })
          : Response.json(rows);
      } catch {
        return new Response('Astia unavailable', { status: 502 });
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

// A relative path is safe to write under our temp dir only if it can't escape
// it (no absolute path, no `..` segment) — uploaded names are untrusted.
function safeRelPath(rel: string): string | null {
  if (rel === '' || rel.startsWith('/') || rel.split('/').includes('..')) {
    return null;
  }
  return rel;
}

// Folder uploads ship the media alongside the GEDCOM as `media`/`mediaPath`
// field pairs. Write them to a temp dir (preserving relative layout) and return
// it as the importer's sourceDir; the caller removes it once the import is done.
// Returns null for a plain single-file upload (no media → no local sourceDir).
async function stageUploadedMedia(form: FormData): Promise<string | null> {
  const files = form.getAll('media');
  const paths = form.getAll('mediaPath');
  if (files.length === 0) return null;
  const dir = await mkdtemp(join(tmpdir(), 'sukulinja-upload-'));
  const items = files.map((f, i) => ({ f, rel: paths[i] }));
  await runPool(items, 8, async ({ f, rel }) => {
    if (!(f instanceof File) || typeof rel !== 'string') return;
    const safe = safeRelPath(rel);
    if (safe === null) return;
    const dest = join(dir, safe);
    await mkdir(dirname(dest), { recursive: true });
    await Bun.write(dest, f);
  });
  return dir;
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
  // Keep the readable name (accents/casing) for display; the slug is derived.
  const displayName = rawName.replace(/\.ged(?:com)?$/iu, '').trim();
  const slug = slugFromFilename(rawName);
  const text = await file.text();
  const sourceFilename = file.name;
  const sourceDir = await stageUploadedMedia(form);

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
          text,
          sourceFilename,
          sourceDir: sourceDir ?? undefined,
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
        if (sourceDir !== null) {
          await rm(sourceDir, { recursive: true, force: true });
        }
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

// `{ volumeId, image }`; anything else is rejected.
async function readMark(req: Request): Promise<MarkTarget | null> {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return typeof body?.volumeId === 'string' && typeof body.image === 'number'
    ? { volumeId: body.volumeId, image: body.image }
    : null;
}

async function routeMark(req: Request, handlers: DatasetHandlers, id: number) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const target = await readMark(req);
  return target === null
    ? new Response('expected { volumeId, image }', { status: 400 })
    : await handlers.handleMark(id, target);
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
  const citation = /^\/api\/citations\/(?<id>\d+)\/scans$/.exec(rest);
  if (citation !== null) {
    return await routeMark(req, handlers, Number(citation.groups!.id));
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

// An Astia Volume's Images, shared by every dataset: their Astia viewer
// URLs in order, or one Image itself.
async function routeAstia(astia: Astia, req: Request, pathname: string) {
  const m = ASTIA_RE.exec(pathname);
  if (m === null) return null;
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const { volumeId, n } = m.groups!;
  return n === undefined
    ? await handleViewerUrls(astia, volumeId!)
    : await handleAstiaImage(astia, req, {
        volumeId: volumeId!,
        image: Number(n)
      });
}

async function handleViewerUrls(astia: Astia, volumeId: string) {
  const urls = await viewerUrls(astia, volumeId).catch(() => null);
  return urls === null
    ? new Response('Astia unavailable', { status: 502 })
    : Response.json(urls);
}

// `?size=thumb` gives the 250px one. An Image never changes, so the webview
// may keep it.
async function handleAstiaImage(astia: Astia, req: Request, at: ImageRef) {
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';
  const size = thumb ? 'thumb' : 'full';
  // undefined: Astia couldn't be reached; null: the Volume has no such Image.
  const path = await astiaImage(astia, at, size, req.signal).catch(
    () => undefined
  );
  if (path === undefined) {
    return new Response('Astia unavailable', { status: 502 });
  }
  if (path === null) return new Response('image not found', { status: 404 });
  return new Response(Bun.file(path), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'max-age=31536000, immutable'
    }
  });
}

// Routes outside any dataset, shared by them all: Astia's Images and the
// cache they're kept in.
async function routeShared(astia: Astia, req: Request, pathname: string) {
  if (pathname === '/settings/scan-cache') return await routeScanCache(req);
  return await routeAstia(astia, req, pathname);
}

export interface ApiOptions {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
}

export function createApi(
  registry: DatasetRegistry,
  options: ApiOptions = {}
): ApiHandlers {
  useDataFolder(registry.root);
  const astia = options.astia ?? openAstia(join(registry.root, '.astia-cache'));
  const scans = openScans({ pins: openPins(registry.root), astia });
  // Kept by the Database they're bound to: the registry alone decides when
  // a dataset's Database is closed and replaced (by an import or a delete),
  // and the next request then opens the new one and gets new handlers.
  const handlersByDb = new WeakMap<Database, DatasetHandlers>();

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
      handlers = createDatasetHandlers(db, scans);
      handlersByDb.set(db, handlers);
    }
    return handlers;
  }

  return {
    async routeApi(req, pathname) {
      if (pathname === '/import') {
        if (req.method !== 'POST') {
          return new Response('method not allowed', { status: 405 });
        }
        return await handleImport(req, registry);
      }
      if (pathname === '/datasets') {
        return Response.json(await registry.list());
      }
      if (pathname.startsWith('/datasets/')) {
        if (req.method !== 'DELETE') {
          return new Response('method not allowed', { status: 405 });
        }
        const slug = pathname.slice('/datasets/'.length);
        return await handleDeleteDataset(registry, slug);
      }
      const shared = await routeShared(astia, req, pathname);
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
