// The routes outside any dataset, shared by them all, that aren't
// operations (shared-operations.ts): an Astia Volume's Images, and whether
// Astia has re-scanned a Volume. Switching to a re-scan's new filming is a
// dataset's operation (operations.ts).

import { basename } from 'node:path';

import { AstiaError, NoImageError, viewerUrls } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { routeRescan } from './myheritage';
import type { KeptPins } from './myheritage';
import { OffloadedError } from './storage';
import type { StorageImages } from './storage';

const ASTIA_RE =
  /^\/astia\/volumes\/(?<volumeId>\d+)\/(?:images(?:\/(?<n>\d+))?|(?<rescan>rescan))$/u;

// What the shared routes read: Astia, the Images Storage keeps of it, and
// the pins every dataset made on them.
interface Shared {
  astia: Astia;
  images: StorageImages;
  kept: () => Promise<KeptPins>;
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

async function handleViewerUrls(astia: Astia, volumeId: string) {
  const urls = await viewerUrls(astia, volumeId).catch(astiaFailed);
  return urls instanceof Response ? urls : Response.json(urls);
}

// `?size=thumb` gives the 250px one. The webview keeps it by its file id,
// asking each time: a re-scan puts another photograph at the same number.
async function handleAstiaImage(
  images: StorageImages,
  req: Request,
  at: ImageRef
) {
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';
  const size = thumb ? 'thumb' : 'full';
  // null: the Volume has no such Image. A request given up as its client
  // left gets the same answer as Astia failing; no one reads it.
  const path = await images
    .image(at, size, req.signal)
    .catch((err: unknown) =>
      err instanceof NoImageError
        ? new Response('Astia no longer has this Image.', { status: 410 })
        : err instanceof OffloadedError
          ? new Response('This Image is offloaded.', { status: 409 })
          : astiaFailed(
              req.signal.aborted ? new AstiaError('client left') : err
            )
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

// An Astia Volume's Images: their Astia viewer URLs in order, or one Image
// itself; or Astia's re-scan of the Volume.
async function routeAstia(shared: Shared, req: Request, pathname: string) {
  const m = ASTIA_RE.exec(pathname);
  if (m === null) return null;
  const { astia, images } = shared;
  const { volumeId, n, rescan } = m.groups!;
  if (rescan !== undefined) {
    return await routeRescan(shared, req, volumeId!).catch(astiaFailed);
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return n === undefined
    ? await handleViewerUrls(astia, volumeId!)
    : await handleAstiaImage(images, req, {
        volumeId: volumeId!,
        image: Number(n)
      });
}

// Null for any path that isn't one of the shared routes.
export async function routeShared(
  shared: Shared,
  req: Request,
  pathname: string
) {
  return await routeAstia(shared, req, pathname);
}
