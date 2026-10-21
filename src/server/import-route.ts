// The import endpoint. POST /import streams the import as newline-delimited
// JSON: {type:'log'} progress lines, then {type:'done', info},
// {type:'cancelled'} or {type:'error'}. Headers are already sent by the
// time the import runs, so failures surface as an error event rather than
// an HTTP status. An import into an existing dataset first sends
// {type:'review', id, review} and waits for POST /import/<id> with
// `{ merge }` to say whether to save it.

import { slugFromFilename, withoutExtension } from '@common/slug';
import type { ImportReview } from '@common/types';

import type { DatasetRegistry } from './dataset-registry';
import { ImportCancelled, importDataset } from './import-dataset';

const ANSWER_RE = /^\/import\/(?<id>[0-9a-f-]+)$/u;

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
  const source = await importSource(file);
  if (source === null) return 'expected a .ged, .gedcom or .gdz file';
  // Keep the readable name (accents/casing) for display; the slug is derived.
  return {
    source,
    displayName: withoutExtension(rawName).trim(),
    slug: slugFromFilename(rawName),
    sourceFilename: file.name
  };
}

export function importRoutes(registry: DatasetRegistry) {
  // The imports waiting on their review, by id.
  const waiting = new Map<string, (merge: boolean) => void>();

  function handleImport(
    upload: Exclude<Awaited<ReturnType<typeof readUpload>>, string>
  ) {
    let asked: string | null = null;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        function send(event: unknown) {
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
          const outcome = await importDataset({
            registry,
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

  return async function routeImport(req: Request, pathname: string) {
    const answering = ANSWER_RE.exec(pathname);
    if (pathname !== '/import' && answering === null) return null;
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    if (answering !== null) return await answer(req, answering.groups!.id!);
    const upload = await readUpload(req);
    if (typeof upload === 'string') {
      return new Response(upload, { status: 400 });
    }
    return handleImport(upload);
  };
}
