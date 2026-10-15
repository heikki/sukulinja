// Full-size Images for an unattended job, through the Scan viewer's image
// cache: one at a time, with a gap between the ones fetched from Astia, so
// a bulk run doesn't hammer the archive. Images already cached are read
// straight away, and the ones fetched stay for the Scan viewer.

import { astiaImage, isImageCached } from '@server/citation-scans/images';
import type { ImageRef } from '@server/citation-scans/reader';

const GAP_MS = 1000;

let queue: Promise<unknown> = Promise.resolve();
// Resolves when the next fetch from Astia may start.
let gap: Promise<void> = Promise.resolve();

async function load(at: ImageRef) {
  const fetching = !(await isImageCached(at.volumeId, at.image));
  if (fetching) {
    const wait = gap;
    gap = wait.then(async () => {
      await Bun.sleep(GAP_MS);
    });
    await wait;
  }
  const path = await astiaImage(
    at.volumeId,
    at.image,
    'full',
    new AbortController().signal
  );
  if (path === null) {
    throw new Error(`Volume ${at.volumeId} has no Image ${at.image}`);
  }
  return await Bun.file(path).bytes();
}

export function pacedImage(at: ImageRef) {
  const run = queue.then(async () => await load(at));
  queue = run.catch(() => undefined);
  return run;
}
