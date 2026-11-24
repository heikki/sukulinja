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
// those that couldn't be, which aren't tried again until the app restarts.
const making = new Map<string, Promise<boolean>>();
const unscalable = new Set<string>();

async function make(source: string, target: string) {
  try {
    const { width, height } = await new Bun.Image(source).metadata();
    const scale = Math.min(1, SHORT_EDGE / Math.min(width, height));
    const bytes = await new Bun.Image(source)
      .resize(
        Math.max(1, Math.round(width * scale)),
        Math.max(1, Math.round(height * scale))
      )
      .jpeg({ quality: JPEG_QUALITY })
      .bytes();
    await mkdir(dirname(target), { recursive: true });
    // Written aside and moved in, so a thumbnail is never seen half done.
    const part = `${target}.${process.pid}.part`;
    await Bun.write(part, bytes);
    await rename(part, target);
    return true;
  } catch {
    return false;
  }
}

// The thumbnail of `name`, a file of `mediaDir` known to be there: the
// path to serve, which is the file itself when it can't be scaled.
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
  if (await made) return target;
  unscalable.add(source);
  return source;
}

// Removes a file's thumbnail with it; one never made is fine.
export async function removeThumbnail(mediaDir: string, name: string) {
  await rm(thumbPath(mediaDir, name), { force: true });
}
