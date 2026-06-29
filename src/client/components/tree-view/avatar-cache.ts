import { mediaUrl } from '@client/api';
import type { PersonRow, PhotoCrop } from '@common/types';

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
  return () => listeners.delete(listener);
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

// A ready object URL, or null while one is generated in the background. Keys
// that failed to generate stay null and are not retried (a reload clears them),
// so a broken photo can't spin a fetch-and-repaint loop.
export function avatarUrl(person: PersonRow) {
  if (person.photo_path === null || person.crop === null) return null;
  const { left, top, width, height } = person.crop;
  const key = `${person.photo_path}|${left},${top},${width},${height}`;
  const url = getReady(key);
  if (url !== undefined) return url;
  if (failed.has(key) || inflight.has(key)) return null;
  inflight.set(key, generate(person.photo_path, person.crop, key));
  return null;
}

async function generate(photoPath: string, crop: PhotoCrop, key: string) {
  try {
    // Cover the round avatar with a centred square of the crop's shorter side.
    const side = Math.min(crop.width, crop.height);
    const sx = crop.left + (crop.width - side) / 2;
    const sy = crop.top + (crop.height - side) / 2;
    const blob = await fetch(mediaUrl(photoPath)).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob, sx, sy, side, side, {
      resizeWidth: TARGET_PX,
      resizeHeight: TARGET_PX,
      resizeQuality: 'high'
    });
    const canvas = new OffscreenCanvas(TARGET_PX, TARGET_PX);
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      failed.add(key);
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
    // A broken or undecodable photo: record it so the silhouette stays and we
    // don't re-fetch it on every repaint. No notify — nothing changed on screen.
    failed.add(key);
  } finally {
    inflight.delete(key);
  }
}
