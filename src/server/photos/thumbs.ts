// A Photo's thumbnail, for the tiles of the Photos tab and the person
// panel: the picture scaled to a few hundred pixels, made the first time
// it's asked for and kept in the `thumbs` folder beside the dataset's
// media. A media file is named
// by its content, so its thumbnail never goes stale: it's made once, and
// both are served to be cached for good. A picture that can't be scaled
// (a HEIC on a system without the codec) is served whole instead.

import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// The Photos tab's and person panel's tiles are some 7rem wide at most;
// this covers them at twice the density.
const SHORT_EDGE = 320;
const JPEG_QUALITY = 80;

// Media and thumbnails are named by their content, so never change.
export const FOREVER = 'public, max-age=31536000, immutable';

// Where the thumbnails of the media in `mediaDir` are kept.
export function thumbsDirOf(mediaDir: string) {
  return join(dirname(mediaDir), 'thumbs');
}

function thumbPath(mediaDir: string, name: string) {
  return join(thumbsDirOf(mediaDir), `${name}.jpg`);
}

// Being made now, so that tiles asking at once make each only once; and
// the pictures that can't be scaled, which aren't tried again until the
// app restarts.
const making = new Map<string, Promise<Made>>();
const unscalable = new Set<string>();

// Made, or the picture can't be scaled, or it couldn't be saved (a full
// disk, say), which a later ask tries again.
type Made = 'made' | 'unscalable' | 'unsaved';

async function scaled(source: string) {
  try {
    const { width, height } = await new Bun.Image(source).metadata();
    const scale = Math.min(1, SHORT_EDGE / Math.min(width, height));
    return await new Bun.Image(source)
      .resize(
        Math.max(1, Math.round(width * scale)),
        Math.max(1, Math.round(height * scale))
      )
      .jpeg({ quality: JPEG_QUALITY })
      .bytes();
  } catch {
    return null;
  }
}

async function make(source: string, target: string): Promise<Made> {
  const bytes = await scaled(source);
  if (bytes === null) return 'unscalable';
  // Written aside and moved in, so a thumbnail is never seen half done.
  const part = `${target}.${process.pid}.part`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(part, bytes);
    await rename(part, target);
    return 'made';
  } catch {
    await rm(part, { force: true }).catch(() => undefined);
    return 'unsaved';
  }
}

// The thumbnail of `name`, a file of `mediaDir` known to be there: the
// path to serve, which is the file itself when there's none.
export async function thumbnail(mediaDir: string, name: string) {
  const source = join(mediaDir, name);
  const target = thumbPath(mediaDir, name);
  if (unscalable.has(source)) return source;
  if (await Bun.file(target).exists()) return target;
  let made = making.get(target);
  if (made === undefined) {
    made = make(source, target);
    making.set(target, made);
    void made.finally(() => {
      making.delete(target);
    });
  }
  const how = await made;
  if (how === 'made') return target;
  if (how === 'unscalable') unscalable.add(source);
  return source;
}

// Removes a file's thumbnail with it; one never made is fine.
export async function removeThumbnail(mediaDir: string, name: string) {
  await rm(thumbPath(mediaDir, name), { force: true });
}

// Makes the thumbnails of `names` that aren't made yet, one at a time,
// so the Photos tab finds them ready the first time it opens. Those
// made already cost a look on disk each.
export async function warmThumbnails(mediaDir: string, names: string[]) {
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- one at a time, in the background
    if (await Bun.file(join(mediaDir, name)).exists()) {
      // eslint-disable-next-line no-await-in-loop -- as above
      await thumbnail(mediaDir, name);
    }
  }
}
