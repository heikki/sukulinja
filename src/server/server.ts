import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import type { FamilyRow, PersonRow } from '@common/types';

import { imageLinks } from './citation-scans/astia';
import { astiaImage } from './citation-scans/images';
import { routeScanCache } from './citation-scans/scan-cache';
import { useDataFolder } from './citation-scans/scans';
import type { MarkTarget } from './citation-scans/scans';
import { createCitations } from './citations';
import type { DatasetRegistry } from './dataset-registry';
import { importDataset, slugFromFilename } from './import-dataset';
import { createPersonDetails } from './person-details';
import { runPool } from './pool';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;
const ASTIA_RE =
  /^\/astia\/volumes\/(?<volumeId>\d+)\/images(?:\/(?<n>\d+))?$/u;

function parseYear(date: string | null): number | null {
  if (date === null) return null;
  const m = /(?<year>\d{4})/.exec(date);
  return m === null ? null : parseInt(m.groups!.year!, 10);
}

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers {
  handlePersons: () => Response;
  handleFamilies: () => Response;
  handlePerson: (id: number) => Response;
  handlePersonScans: (id: number) => Response;
  handleMark: (id: number, target: MarkTarget) => Promise<Response>;
  handleVolumeCitations: (volumeId: string) => Promise<Response>;
  handleMedia: (rest: string, mediaRoot: string) => Promise<Response>;
}

function createDatasetHandlers(db: Database): DatasetHandlers {
  const listPersons = db.prepare(`
    SELECT
      p.id,
      n.given,
      n.surname,
      p.sex,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='BIRT' LIMIT 1) AS birth_date,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='DEAT' LIMIT 1) AS death_date,
      m.file_path AS photo_path,
      ml.crop_top,
      ml.crop_left,
      ml.crop_width,
      ml.crop_height
    FROM persons p
    LEFT JOIN names n ON n.person_id = p.id AND n.sort_order = 0
    LEFT JOIN media_links ml ON ml.id = (
      SELECT ml2.id FROM media_links ml2
      JOIN media m2 ON m2.id = ml2.media_id
      WHERE ml2.scope_type='person' AND ml2.scope_id=p.id
      ORDER BY ml2.is_primary DESC, ml2.sort_order ASC, ml2.id ASC
      LIMIT 1
    )
    LEFT JOIN media m ON m.id = ml.media_id
    ORDER BY n.surname COLLATE NOCASE, n.given COLLATE NOCASE
  `);

  type ListRow = Omit<PersonRow, 'birth_year' | 'death_year' | 'crop'> & {
    crop_top: number | null;
    crop_left: number | null;
    crop_width: number | null;
    crop_height: number | null;
  };

  const listFamilies = db.prepare(
    'SELECT id, husband_id, wife_id FROM families'
  );
  const listFamilyChildren = db.prepare(
    'SELECT family_id, person_id FROM family_children ORDER BY family_id, sort_order'
  );
  const citations = createCitations(db);
  const personDetails = createPersonDetails(db, citations);

  return {
    handlePersons() {
      const rows = listPersons.all() as ListRow[];
      const out: PersonRow[] = rows.map((r) => ({
        id: r.id,
        given: r.given,
        surname: r.surname,
        sex: r.sex,
        birth_year: parseYear(r.birth_date),
        death_year: parseYear(r.death_date),
        birth_date: r.birth_date,
        death_date: r.death_date,
        photo_path: r.photo_path,
        crop:
          r.crop_top !== null &&
          r.crop_left !== null &&
          r.crop_width !== null &&
          r.crop_height !== null
            ? {
                top: r.crop_top,
                left: r.crop_left,
                width: r.crop_width,
                height: r.crop_height
              }
            : null
      }));
      return Response.json(out);
    },

    handleFamilies() {
      const fams = listFamilies.all() as Array<Omit<FamilyRow, 'child_ids'>>;
      const kids = listFamilyChildren.all() as Array<{
        family_id: number;
        person_id: number;
      }>;
      const childrenByFamily = new Map<number, number[]>();
      for (const k of kids) {
        let arr = childrenByFamily.get(k.family_id);
        if (arr === undefined) {
          arr = [];
          childrenByFamily.set(k.family_id, arr);
        }
        arr.push(k.person_id);
      }
      const out: FamilyRow[] = fams.map((f) => ({
        id: f.id,
        husband_id: f.husband_id,
        wife_id: f.wife_id,
        child_ids: childrenByFamily.get(f.id) ?? []
      }));
      return Response.json(out);
    },

    handlePerson(id) {
      const details = personDetails(id);
      return details === null
        ? new Response('person not found', { status: 404 })
        : Response.json(details);
    },

    // One line per church-book citation as its scans resolve. Astia is slow
    // and throttled, so a person's citations share one streamed request
    // rather than holding a connection each.
    handlePersonScans(id) {
      const lines = citations.scansOf(id);
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
  handlersBySlug: Map<string, DatasetHandlers>,
  slug: string
): Promise<Response> {
  try {
    handlersBySlug.delete(slug);
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
      : handlers.handlePersonScans(id);
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
// links in order, or one Image itself.
async function routeAstia(req: Request, pathname: string) {
  const m = ASTIA_RE.exec(pathname);
  if (m === null) return null;
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const { volumeId, n } = m.groups!;
  return n === undefined
    ? await handleImageLinks(volumeId!)
    : await handleAstiaImage(req, volumeId!, Number(n));
}

async function handleImageLinks(volumeId: string) {
  const links = await imageLinks(volumeId).catch(() => null);
  return links === null
    ? new Response('Astia unavailable', { status: 502 })
    : Response.json(links);
}

// `?size=thumb` gives the 250px one. An Image never changes, so the webview
// may keep it.
async function handleAstiaImage(req: Request, volumeId: string, n: number) {
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';
  const size = thumb ? 'thumb' : 'full';
  // undefined: Astia couldn't be reached; null: the Volume has no such Image.
  const path = await astiaImage(volumeId, n, size, req.signal).catch(
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
async function routeShared(req: Request, pathname: string) {
  if (pathname === '/settings/scan-cache') return await routeScanCache(req);
  return await routeAstia(req, pathname);
}

export function createApi(registry: DatasetRegistry): ApiHandlers {
  useDataFolder(registry.root);
  const handlersBySlug = new Map<string, DatasetHandlers>();

  function tryOpen(slug: string): Database | null {
    try {
      return registry.open(slug);
    } catch {
      return null;
    }
  }

  function getHandlers(slug: string): DatasetHandlers | null {
    const cached = handlersBySlug.get(slug);
    if (cached !== undefined) return cached;
    const db = tryOpen(slug);
    if (db === null) return null;
    const h = createDatasetHandlers(db);
    handlersBySlug.set(slug, h);
    return h;
  }

  return {
    async routeApi(req, pathname) {
      if (pathname === '/import') {
        if (req.method !== 'POST') {
          return new Response('method not allowed', { status: 405 });
        }
        handlersBySlug.clear();
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
        return await handleDeleteDataset(registry, handlersBySlug, slug);
      }
      const shared = await routeShared(req, pathname);
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
