// The routes for datasets as a whole, each a registry verb: GET /datasets
// lists them; DELETE /datasets/<slug> deletes one; POST …/export saves its
// GEDZIP.
//
// POST /import streams the import as newline-delimited ImportEvents: log
// lines, then done or error. Headers are already sent by the time the
// import runs, so failures surface as an error event rather than an HTTP
// status. An import only makes a new dataset, as the tree is edited in the
// app (ADR-0021): one under a name taken is refused with 409.
//
// A verb refused in words the app can show answers 404 or 409; anything
// else thrown is a bug, and is thrown on.

import { slugFromFilename, withoutExtension } from '@/common/slug';
import type { ImportEvent, NewChange } from '@/common/types';

import { OutdatedDatasetError } from './db';
import { DatasetExists, DatasetNotFound } from './registry';
import type { DatasetRegistry } from './registry';

const DATASET_RE =
  /^\/datasets\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<verb>\/export)?$/u;

function refused(err: unknown) {
  if (err instanceof DatasetNotFound) {
    return new Response(err.message, { status: 404 });
  }
  if (err instanceof OutdatedDatasetError) {
    return new Response(`This dataset was ${err.message}.`, { status: 409 });
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  throw err;
}

function notAllowed() {
  return new Response('method not allowed', { status: 405 });
}

// What an upload holds, by its extension: a GEDZIP, or a GEDCOM's text.
async function importSource(file: File) {
  if (/\.gdz$/iu.test(file.name)) return { gedzip: await file.bytes() };
  if (/\.ged(?:com)?$/iu.test(file.name)) return { gedcom: await file.text() };
  return null;
}

async function readUpload(req: Request) {
  const form = await req.formData().catch(() => null);
  if (form === null) return 'expected multipart/form-data';
  const file = form.get('file');
  if (!(file instanceof File)) return 'missing file field';
  const nameField = form.get('name');
  const rawName =
    typeof nameField === 'string' && nameField.trim() !== ''
      ? nameField.trim()
      : file.name;
  const slug = slugFromFilename(rawName);
  if (slug === '') return 'The name needs a letter or a digit.';
  const source = await importSource(file);
  if (source === null) return 'expected a .ged, .gedcom or .gdz file';
  // Keep the readable name (accents/casing) for display; the slug is derived.
  return {
    source,
    displayName: withoutExtension(rawName).trim(),
    slug,
    sourceFilename: file.name
  };
}

type Upload = Exclude<Awaited<ReturnType<typeof readUpload>>, string>;

interface LifecycleOptions {
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string;
  // Told of an import saved, into the new dataset.
  changed?: (slug: string, change: NewChange) => void;
}

export function lifecycleRoutes(
  registry: DatasetRegistry,
  { exportDir, changed = () => undefined }: LifecycleOptions = {}
) {
  function handleImport(upload: Upload) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        function send(event: ImportEvent) {
          controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
        }
        try {
          const outcome = await registry.import({
            ...upload,
            log: (message) => {
              send({ type: 'log', message });
            }
          });
          changed(upload.slug, {
            on: null,
            what: {
              kind: 'import',
              file: upload.sourceFilename,
              merged: false,
              lost: 0
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

  async function routeImport(req: Request, pathname: string) {
    if (pathname !== '/import') return null;
    if (req.method !== 'POST') return notAllowed();
    const upload = await readUpload(req);
    if (typeof upload === 'string') {
      return new Response(upload, { status: 400 });
    }
    if (registry.has(upload.slug)) {
      return new Response(new DatasetExists(upload.displayName).message, {
        status: 409
      });
    }
    return handleImport(upload);
  }

  // One dataset's verb: deleting it or exporting it.
  async function onDataset(slug: string, verb: string | undefined) {
    if (verb === undefined) {
      return (await registry.delete(slug))
        ? new Response(null, { status: 204 })
        : new Response('dataset not found', { status: 404 });
    }
    return Response.json(await registry.export(slug, { dir: exportDir }));
  }

  return async function routeLifecycle(req: Request, pathname: string) {
    if (pathname === '/datasets') {
      if (req.method !== 'GET') return notAllowed();
      return Response.json(await registry.list());
    }
    const m = DATASET_RE.exec(pathname);
    if (m === null) return await routeImport(req, pathname);
    const { slug, verb } = m.groups!;
    if (req.method !== (verb === undefined ? 'DELETE' : 'POST')) {
      return notAllowed();
    }
    return await onDataset(slug!, verb).catch(refused);
  };
}
