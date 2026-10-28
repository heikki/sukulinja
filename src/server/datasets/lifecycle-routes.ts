// The routes for datasets as a whole, each a registry verb: GET /datasets
// lists them; DELETE /datasets/<slug> deletes one; POST …/export saves its
// GEDZIP, …/export-myheritage a GEDCOM 5.5.1 file, and …/undo-import puts
// back its database from before its last import.
//
// POST /import streams the import as newline-delimited ImportEvents: log
// lines, then done, cancelled or error. Headers are already sent by the time
// the import runs, so failures surface as an error event rather than an
// HTTP status. An import into an existing dataset first sends a review and
// waits for POST /import/<id> with `{ merge }` to say whether to save it.
//
// A verb refused in words the app can show answers 404 or 409; anything
// else thrown is a bug, and is thrown on.

import { slugFromFilename, withoutExtension } from '@/common/slug';
import type { ImportEvent, ImportReview } from '@/common/types';

import { ImportCancelled } from '../import/dataset';
import { OutdatedDatasetError } from './db';
import { DatasetNotFound } from './registry';
import type { DatasetRegistry } from './registry';

const DATASET_RE =
  /^\/datasets\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<verb>\/export|\/export-myheritage|\/undo-import)?$/u;
const ANSWER_RE = /^\/import\/(?<id>[0-9a-f-]+)$/u;

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

export function lifecycleRoutes(
  registry: DatasetRegistry,
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string
) {
  // The imports waiting on their review, by id.
  const waiting = new Map<string, (merge: boolean) => void>();

  function handleImport(upload: Upload) {
    let asked: string | null = null;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        function send(event: ImportEvent) {
          controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
        }
        async function review(r: ImportReview) {
          const id = crypto.randomUUID();
          asked = id;
          send({ type: 'review', id, review: r });
          const answered = Promise.withResolvers<boolean>();
          waiting.set(id, answered.resolve);
          return await answered.promise;
        }
        try {
          const outcome = await registry.import({
            ...upload,
            review,
            log: (message) => {
              send({ type: 'log', message });
            }
          });
          send({ type: 'done', info: outcome.info });
        } catch (err) {
          if (err instanceof ImportCancelled) send({ type: 'cancelled' });
          else {
            const message =
              err instanceof Error ? err.message : 'import failed';
            send({ type: 'error', message });
          }
        } finally {
          if (asked !== null) waiting.delete(asked);
          controller.close();
        }
      },
      // The page went away while the import waited on it: nothing is saved.
      cancel() {
        if (asked !== null) waiting.get(asked)?.(false);
      }
    });
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson' }
    });
  }

  async function answer(req: Request, id: string) {
    const resolve = waiting.get(id);
    if (resolve === undefined) {
      return new Response('no import is waiting', { status: 404 });
    }
    const body = (await req.json().catch(() => null)) as {
      merge?: unknown;
    } | null;
    if (typeof body?.merge !== 'boolean') {
      return new Response('expected { merge: boolean }', { status: 400 });
    }
    waiting.delete(id);
    resolve(body.merge);
    return new Response(null, { status: 204 });
  }

  async function routeImport(req: Request, pathname: string) {
    const answering = ANSWER_RE.exec(pathname);
    if (pathname !== '/import' && answering === null) return null;
    if (req.method !== 'POST') return notAllowed();
    if (answering !== null) return await answer(req, answering.groups!.id!);
    const upload = await readUpload(req);
    if (typeof upload === 'string') {
      return new Response(upload, { status: 400 });
    }
    return handleImport(upload);
  }

  // One dataset's verb: deleting it, exporting it or undoing its import.
  async function onDataset(slug: string, verb: string | undefined) {
    if (verb === undefined) {
      return (await registry.delete(slug))
        ? new Response(null, { status: 204 })
        : new Response('dataset not found', { status: 404 });
    }
    if (verb === '/undo-import') {
      return (await registry.undoImport(slug))
        ? new Response(null, { status: 204 })
        : new Response('no import to undo', { status: 404 });
    }
    const kind = verb === '/export' ? 'gdz' : 'myheritage';
    return Response.json(await registry.export(slug, { kind, dir: exportDir }));
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
