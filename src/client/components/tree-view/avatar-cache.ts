import type { PersonRow, PhotoCrop } from '@/common/types';

// Avatars are derived in-browser from the original photo plus the marked crop,
// so the crop stays adjustable (it's just metadata) while the rendered face is
// sharp: createImageBitmap downscales with high-quality filtering, unlike the
// live SVG crop which softens under the chart's zoom transform. Results are
// memoised by (photo, crop) for the session.

// 2x the on-screen avatar at max zoom (28px radius -> 56px box, zoom 2, DPR 2)
// keeps it crisp without holding oversized bitmaps.
const TARGET_PX = 256;

// Cap retained object URLs so a long session browsing many people doesn't pin
// unbounded blob memory. A rendered chart holds far fewer avatars than this, so
// eviction never drops one that's currently on screen.
const MAX_ENTRIES = 512;

const ready = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

// Re-render hook: fires (coalesced to once per microtask) when avatars land.
export function onAvatarReady(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Collapse a burst of completions into a single repaint, and run via microtask
// (not rAF) so avatars still appear when the tab is hidden.
let notifyScheduled = false;
function scheduleNotify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) listener();
  });
}

// LRU on access, so eviction drops the least-recently-used entry.
function getReady(key: string) {
  const url = ready.get(key);
  if (url === undefined) return undefined;
  ready.delete(key);
  ready.set(key, url);
  return url;
}

function setReady(key: string, url: string) {
  ready.set(key, url);
  for (const [oldKey, oldUrl] of ready) {
    if (ready.size <= MAX_ENTRIES) break;
    ready.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
}

// What a person's avatar draws: their marked face once it's cropped, the
// whole photo when no face is marked, or null for the silhouette. A face
// still being cropped is null, and so is one that failed (see faceHref).
export function avatarHref(
  person: PersonRow,
  mediaUrl: (storedPath: string) => string
) {
  if (person.photo_path === null) return null;
  const photo = mediaUrl(person.photo_path);
  const { crop } = person;
  if (crop === null) return photo;
  const face = faceHref(photo, crop);
  return typeof face === 'object' ? face.cropped : null;
}

// The face `crop` marks on `photo`: an object URL of it once cropped,
// 'cropping' until then, and 'failed' for a photo that couldn't be. Those
// that failed aren't retried (a reload clears them), so a broken photo
// can't spin a fetch-and-repaint loop. onAvatarReady fires as each lands.
export type Face = { cropped: string } | 'cropping' | 'failed';

export function faceHref(photo: string, crop: PhotoCrop): Face {
  const { left, top, width, height } = crop;
  const key = `${photo}|${left},${top},${width},${height}`;
  const url = getReady(key);
  if (url !== undefined) return { cropped: url };
  if (failed.has(key)) return 'failed';
  if (!inflight.has(key)) inflight.set(key, generate(photo, crop, key));
  return 'cropping';
}

// A face that couldn't be cropped: the avatar keeps its silhouette, and a
// Photo's tile in the person panel turns to the whole photo, so it's told.
function fail(key: string) {
  failed.add(key);
  scheduleNotify();
}

async function generate(photo: string, crop: PhotoCrop, key: string) {
  try {
    // Cover the round avatar with a centred square of the crop's shorter side.
    const side = Math.min(crop.width, crop.height);
    const sx = crop.left + (crop.width - side) / 2;
    const sy = crop.top + (crop.height - side) / 2;
    const blob = await fetch(photo).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob, sx, sy, side, side, {
      resizeWidth: TARGET_PX,
      resizeHeight: TARGET_PX,
      resizeQuality: 'high'
    });
    const canvas = new OffscreenCanvas(TARGET_PX, TARGET_PX);
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      fail(key);
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const out = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.9
    });
    setReady(key, URL.createObjectURL(out));
    scheduleNotify();
  } catch {
    // A broken or undecodable photo: recorded, so it isn't re-fetched on
    // every repaint.
    fail(key);
  } finally {
    inflight.delete(key);
  }
}
