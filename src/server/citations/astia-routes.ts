// The routes outside any dataset, shared by them all: an Astia Volume's
// Images, the Scan cache they're kept in, and Astia's re-scan of a Volume.

import { basename } from 'node:path';

import { AstiaError, NoImageError, viewerUrls } from './astia/astia';
import type { Astia, ImageRef } from './astia/astia';
import { routeScanCache } from './astia/scan-cache';
import type { ScanCache } from './astia/scan-cache';
import { routeRescan } from './myheritage';
import type { KeptPins } from './myheritage';

const ASTIA_RE =
  /^\/astia\/volumes\/(?<volumeId>\d+)\/(?:images(?:\/(?<n>\d+))?|(?<rescan>rescan))$/u;

// What the shared routes read: Astia, the Scan cache its Images are kept
// in, and the pins every dataset made on them.
interface Shared {
  astia: Astia;
  cache: ScanCache;
  kept: () => Promise<KeptPins>;
}

// A request to Astia failing answers 502, in words the Scan viewer can
// show; anything else thrown is a bug, and is thrown on.
export function astiaFailed(err: unknown) {
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

// An Astia Volume's Images: their Astia viewer URLs in order, or one Image
// itself; or Astia's re-scan of the Volume.
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

// Null for any path that isn't one of the shared routes.
export async function routeShared(
  shared: Shared,
  req: Request,
  pathname: string
) {
  if (pathname === '/settings/scan-cache') {
    return await routeScanCache(shared.cache, req);
  }
  return await routeAstia(shared, req, pathname);
}
