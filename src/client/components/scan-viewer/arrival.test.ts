import { beforeEach, expect, test } from 'bun:test';

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Viewport } from '@/client/pan-zoom';

import { ImageArrival, neighbours, THUMB_GRACE_MS } from './arrival';
import type { ViewChange } from './arrival';

// Full Images and thumbnails of one shape, a thumbnail a thirtieth or so.
const FULL = { width: 3000, height: 2000 };
const THUMB = { width: 120, height: 80 };

function full(volumeId: string, image: number, retry = 0) {
  return `full ${volumeId} ${image} ${retry}`;
}

function thumb(volumeId: string, image: number) {
  return `thumb ${volumeId} ${image}`;
}

interface Waiting {
  resolve: (size: Viewport) => void;
  reject: (err: Error) => void;
}

let now = 0;
let timers: Array<{ at: number; run: () => void }> = [];
let decoding = new Map<string, Waiting>();
let asked: string[] = [];
let views: Array<ViewChange | null> = [];
let wanted: string[][] = [];
let kept: string[][] = [];
let failures = 0;
let arrival: ImageArrival = open();

function host(): ReactiveControllerHost {
  return {
    updateComplete: Promise.resolve(true),
    addController(_c: ReactiveController) {
      // no-op
    },
    removeController(_c: ReactiveController) {
      // no-op
    },
    requestUpdate() {
      // no-op
    }
  };
}

function open() {
  return new ImageArrival(host(), {
    imageUrl: full,
    thumbUrl: thumb,
    prefetch: {
      want: (urls) => {
        wanted.push(urls);
      },
      keep: (urls) => {
        kept.push(urls);
      }
    },
    placeView: (change) => {
      views.push(change);
    },
    failed: () => {
      failures += 1;
    },
    decode: async (url) => {
      asked.push(url);
      const waiting = Promise.withResolvers<Viewport>();
      decoding.set(url, waiting);
      return await waiting.promise;
    },
    clock: {
      now: () => now,
      later: (ms, run) => {
        timers.push({ at: now + ms, run });
      }
    }
  });
}

beforeEach(() => {
  now = 0;
  timers = [];
  decoding = new Map();
  asked = [];
  views = [];
  wanted = [];
  kept = [];
  failures = 0;
  arrival = open();
});

// The clock moves on to `t`, running what was due by then.
function at(t: number) {
  now = t;
  const due = timers.filter((x) => x.at <= t);
  timers = timers.filter((x) => x.at > t);
  for (const x of due) x.run();
}

async function settled() {
  await Bun.sleep(0);
}

async function arrive(
  url: string,
  size = url.startsWith('thumb') ? THUMB : FULL
) {
  decoding.get(url)!.resolve(size);
  await settled();
}

async function fail(url: string) {
  decoding.get(url)!.reject(new Error('no image'));
  await settled();
}

// Image `image` of Volume v shown, its thumbnail then its full Image.
async function shown(image: number) {
  arrival.show('v', image, 10);
  await arrive(full('v', image));
}

test('a new Volume shows its thumbnail at once, then fades the full Image in over it', async () => {
  expect(arrival.show('v', 1, 10)).toBe(true);
  expect(asked).toEqual([thumb('v', 1), full('v', 1)]);
  await arrive(thumb('v', 1));
  expect(arrival.thumb).toEqual({ url: thumb('v', 1), size: THUMB });
  expect(arrival.frame).toEqual({
    size: { width: 3600, height: 2400 },
    provisional: true
  });
  expect(views).toEqual([{ fit: true, rescale: 1 }]);

  at(200);
  await arrive(full('v', 1));
  expect(arrival.loading).toBe('shown');
  expect(arrival.drawnUrl).toBe(full('v', 1));
  expect(arrival.fading).toBe(true);
  // It stays where the thumbnail's frame put it on screen.
  expect(views.at(-1)).toEqual({ fit: false, rescale: 1.2 });
  expect(arrival.frame).toEqual({ size: FULL, provisional: false });
  arrival.fadeEnded();
  expect(arrival.fading).toBe(false);
});

test('a full Image soon after its thumbnail just appears', async () => {
  arrival.show('v', 1, 10);
  await arrive(thumb('v', 1));
  at(50);
  await arrive(full('v', 1));
  expect(arrival.fading).toBe(false);
});

test('a thumbnail arriving after the full Image is left out', async () => {
  arrival.show('v', 1, 10);
  await arrive(full('v', 1));
  await arrive(thumb('v', 1));
  expect(arrival.thumb).toBeNull();
  expect(views).toEqual([{ fit: true, rescale: 1 }]);
});

test('stepping twice quickly draws only the second, over the last Image', async () => {
  await shown(1);
  arrival.show('v', 2, 10);
  arrival.show('v', 3, 10);
  expect(arrival.loading).toBe('loading');
  await arrive(full('v', 2));
  await arrive(thumb('v', 2));
  expect(arrival.drawnUrl).toBe(full('v', 1));
  expect(arrival.thumb).toBeNull();
  await arrive(full('v', 3));
  expect(arrival.drawnUrl).toBe(full('v', 3));
  expect(arrival.loading).toBe('shown');
});

test('after a step, a thumbnail waits out the grace over the last Image', async () => {
  await shown(1);
  at(1000);
  arrival.show('v', 2, 10);
  at(1050);
  await arrive(thumb('v', 2));
  expect(arrival.thumb).toBeNull();
  // The full Image comes within the grace: no blur, no fade.
  at(1100);
  await arrive(full('v', 2));
  at(1000 + THUMB_GRACE_MS);
  expect(arrival.thumb).toBeNull();
  expect(arrival.drawnUrl).toBe(full('v', 2));
  expect(arrival.fading).toBe(false);
});

test('a thumbnail takes over once the grace is out', async () => {
  await shown(1);
  at(1000);
  arrival.show('v', 2, 10);
  at(1050);
  await arrive(thumb('v', 2));
  at(1000 + THUMB_GRACE_MS);
  expect(arrival.thumb?.url).toBe(thumb('v', 2));
  // Of the last Image's shape, it keeps the view.
  expect(views.at(-1)).toEqual({ fit: false, rescale: 1 });
});

test("a new Volume keeps the last one's Image up, then fits its first", async () => {
  await shown(1);
  views = [];
  expect(arrival.show('w', 1, 10)).toBe(true);
  expect(kept.at(-1)).toEqual([]);
  expect(arrival.drawnUrl).toBe(full('v', 1));
  expect(views).toEqual([]);
  await arrive(full('w', 1), { width: 2000, height: 3000 });
  expect(views).toEqual([{ fit: true, rescale: 1 }]);
  expect(arrival.drawnUrl).toBe(full('w', 1));
});

test("a new Volume's Image failing clears the last; a step's keeps the frame", async () => {
  await shown(1);
  arrival.show('w', 1, 10);
  await fail(full('w', 1));
  expect(arrival.loading).toBe('failed');
  expect(arrival.frame).toBeNull();
  expect(arrival.drawnUrl).toBeNull();
  expect(views.at(-1)).toBeNull();
  expect(failures).toBe(1);

  arrival.show('v', 1, 10);
  await arrive(full('v', 1));
  arrival.show('v', 2, 10);
  await fail(full('v', 2));
  expect(arrival.frame).toEqual({ size: FULL, provisional: false });
  expect(arrival.drawnUrl).toBeNull();
  expect(failures).toBe(2);
});

test('a retry asks again past the last answer', async () => {
  arrival.show('v', 1, 10);
  await fail(full('v', 1));
  arrival.retry();
  expect(arrival.loading).toBe('loading');
  expect(asked.at(-1)).toBe(full('v', 1, 1));
  // Shown again, the same Image isn't asked for again.
  arrival.show('v', 1, 10);
  expect(asked.at(-1)).toBe(full('v', 1, 1));
  await arrive(full('v', 1, 1));
  expect(arrival.drawnUrl).toBe(full('v', 1, 1));
});

test('prefetches the neighbour ahead of the step first, and keeps only those near on a step', async () => {
  await shown(5);
  expect(wanted.at(-1)).toEqual([full('v', 6), full('v', 4)]);
  arrival.show('v', 4, 10);
  expect(kept.at(-1)).toEqual([full('v', 4), full('v', 5), full('v', 3)]);
  await arrive(full('v', 4));
  expect(wanted.at(-1)).toEqual([full('v', 3), full('v', 5)]);
});

test('nothing arriving after the host is gone is drawn', async () => {
  arrival.show('v', 1, 10);
  arrival.hostDisconnected();
  expect(kept.at(-1)).toEqual([]);
  await arrive(thumb('v', 1));
  await arrive(full('v', 1));
  expect(arrival.thumb).toBeNull();
  expect(arrival.drawnUrl).toBeNull();
});

test('prefetches the Image ahead first', () => {
  expect(neighbours(5, 10, 1)).toEqual([6, 4]);
  expect(neighbours(5, 10, -1)).toEqual([4, 6]);
  expect(neighbours(1, 10, 1)).toEqual([2]);
  expect(neighbours(10, 10, 1)).toEqual([9]);
  expect(neighbours(10, null, 1)).toEqual([11, 9]);
});
