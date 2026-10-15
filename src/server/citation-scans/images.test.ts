import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { setCacheDir } from './astia';
import { astiaImage, setImageCacheCap, setImageCacheDir } from './images';

const IMAGES = 10;
const IMAGE_BYTES = 1000;

// Volumes whose Images Astia fails with this status.
const FAILING: Record<string, number> = { '107': 503, '108': 429 };

let dir = '';
// File ids in the order Astia was asked for them.
let fetched: string[] = [];
// While set, Astia holds every image until it resolves.
let hold: PromiseWithResolvers<void> | null = null;

function file(id: string) {
  return { name: 'FILE', children: [{ name: 'URL', tagData: id }] };
}

// A Volume's image lists: full-size files `<volume>-f<n>`, thumbnails
// `<volume>-t<n>`.
function listing(volumeId: string) {
  const ns = Array.from({ length: IMAGES }, (_, i) => i + 1);
  return {
    isot: ns.map((n) => file(`${volumeId}-f${n}`)),
    pienet: ns.map((n) => file(`${volumeId}-t${n}`))
  };
}

async function fakeAstia(input: string | URL | Request) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname.endsWith('/digitoidut.php')) {
    return Response.json(listing(url.searchParams.get('id')!));
  }
  fetched.push(url.searchParams.get('fileId')!);
  await hold?.promise;
  const failing = FAILING[url.searchParams.get('aineistoId')!];
  return failing === undefined
    ? new Response(new Uint8Array(IMAGE_BYTES).fill(0xff))
    : new Response('', { status: failing });
}

function open(
  volumeId: string,
  n: number,
  signal = new AbortController().signal
) {
  return astiaImage(volumeId, n, 'full', signal);
}

async function until(done: () => boolean) {
  // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
  while (!done()) await Bun.sleep(1);
}

// Settles to 'left' when the request was given up.
async function outcome(request: Promise<string | null>) {
  return await request.catch(() => 'left');
}

const astia = spyOn(globalThis, 'fetch').mockImplementation(
  fakeAstia as typeof fetch
);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'astia-images-'));
  setCacheDir(join(dir, 'astia'));
  setImageCacheDir(join(dir, 'images'));
  setImageCacheCap(500 * 1024 * 1024);
  fetched = [];
  hold = null;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterAll(() => {
  astia.mockRestore();
});

test('fetches an Image once, then serves it from the cache', async () => {
  const path = await open('101', 3);
  expect(Bun.file(path!).size).toBe(IMAGE_BYTES);
  expect(await open('101', 3)).toBe(path);
  await astiaImage('101', 3, 'thumb', new AbortController().signal);
  expect(fetched).toEqual(['101-f3', '101-t3']);
});

test('has no Image outside the Volume', async () => {
  expect(await open('102', 0)).toBeNull();
  expect(await open('102', IMAGES + 1)).toBeNull();
  expect(fetched).toEqual([]);
});

test('fetches the latest request first', async () => {
  await open('103', 9);
  hold = Promise.withResolvers();
  const first = open('103', 1);
  await until(() => fetched.length === 2);
  // Each first looks in the cache on disk; let 5 reach the queue before 6.
  const five = open('103', 5);
  await Bun.sleep(50);
  const six = open('103', 6);
  await Bun.sleep(50);
  hold.resolve();
  await Promise.all([first, five, six]);
  expect(fetched).toEqual(['103-f9', '103-f1', '103-f6', '103-f5']);
});

test('drops a queued request whose client has gone', async () => {
  await open('104', 9);
  hold = Promise.withResolvers();
  const first = open('104', 1);
  await until(() => fetched.length === 2);
  const leaving = new AbortController();
  const five = open('104', 5, leaving.signal);
  await Bun.sleep(10);
  leaving.abort();
  expect(await outcome(five)).toBe('left');
  hold.resolve();
  await first;
  await Bun.sleep(10);
  expect(fetched).toEqual(['104-f9', '104-f1']);
});

test('keeps a request another client still waits for', async () => {
  await open('105', 9);
  hold = Promise.withResolvers();
  const first = open('105', 1);
  await until(() => fetched.length === 2);
  const leaving = new AbortController();
  const five = open('105', 5, leaving.signal);
  const staying = open('105', 5);
  await Bun.sleep(10);
  leaving.abort();
  expect(await outcome(five)).toBe('left');
  hold.resolve();
  await Promise.all([first, staying]);
  expect(fetched).toEqual(['105-f9', '105-f1', '105-f5']);
});

test('drops the least recently viewed Images past the cap', async () => {
  setImageCacheCap(2.5 * IMAGE_BYTES);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 2);
  await Bun.sleep(5);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 3);
  const cached = await readdir(join(dir, 'images'));
  expect(cached.sort()).toEqual(['106-f1.jpg', '106-f3.jpg']);
});

test('retries a failing Image briefly, then gives up', async () => {
  const started = performance.now();
  expect(await outcome(open('107', 1))).toBe('left');
  expect(fetched).toEqual(['107-f1', '107-f1', '107-f1']);
  expect(performance.now() - started).toBeLessThan(3000);
});

test("doesn't wait out a rate limit", async () => {
  expect(await outcome(open('108', 1))).toBe('left');
  expect(fetched).toEqual(['108-f1']);
});
