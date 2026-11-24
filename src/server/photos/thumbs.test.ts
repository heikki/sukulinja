import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  removeThumbnail,
  thumbnail,
  thumbsDirOf,
  warmThumbnails
} from './thumbs';

let root = '';
let mediaDir = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thumbs-'));
  mediaDir = join(root, 'media');
  await mkdir(mediaDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A plain grey picture, `width` × `height`, as the simplest file Bun.Image
// reads: a 24-bit BMP, its rows padded to four bytes.
async function picture(name: string, width: number, height: number) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const bmp = new Uint8Array(54 + stride * height).fill(200, 54);
  const head = new DataView(bmp.buffer);
  bmp.set([0x42, 0x4d]);
  head.setUint32(2, bmp.length, true);
  head.setUint32(10, 54, true);
  head.setUint32(14, 40, true);
  head.setInt32(18, width, true);
  head.setInt32(22, height, true);
  head.setUint16(26, 1, true);
  head.setUint16(28, 24, true);
  await writeFile(join(mediaDir, name), bmp);
}

test('a picture is scaled to a thumbnail once, and kept', async () => {
  await picture('big.bmp', 1600, 1200);
  const path = await thumbnail(mediaDir, 'big.bmp');
  expect(path).toBe(join(thumbsDirOf(mediaDir), 'big.bmp.jpg'));
  const made = await new Bun.Image(path).metadata();
  expect(made).toMatchObject({ format: 'jpeg', width: 427, height: 320 });
  const madeAt = Bun.file(path).lastModified;
  expect(await thumbnail(mediaDir, 'big.bmp')).toBe(path);
  expect(Bun.file(path).lastModified).toBe(madeAt);
});

test('one asked for by many at once is made once', async () => {
  await picture('big.bmp', 800, 800);
  const paths = await Promise.all(
    [1, 2, 3].map(async () => await thumbnail(mediaDir, 'big.bmp'))
  );
  expect(new Set(paths).size).toBe(1);
});

test("a small picture isn't enlarged", async () => {
  await picture('small.bmp', 100, 50);
  const path = await thumbnail(mediaDir, 'small.bmp');
  expect(await new Bun.Image(path).metadata()).toMatchObject({
    width: 100,
    height: 50
  });
});

test("one that can't be scaled is served whole", async () => {
  await writeFile(join(mediaDir, 'broken.jpg'), new Uint8Array([0xff, 0xd8]));
  expect(await thumbnail(mediaDir, 'broken.jpg')).toBe(
    join(mediaDir, 'broken.jpg')
  );
});

test('a thumbnail goes with its file', async () => {
  await picture('big.bmp', 800, 600);
  const path = await thumbnail(mediaDir, 'big.bmp');
  await removeThumbnail(mediaDir, 'big.bmp');
  expect(await Bun.file(path).exists()).toBe(false);
  await removeThumbnail(mediaDir, 'never.bmp');
});

test('those not made yet are made ahead, and missing files left be', async () => {
  await picture('a.bmp', 800, 600);
  await picture('b.bmp', 600, 800);
  await warmThumbnails(mediaDir, ['a.bmp', 'gone.bmp', 'b.bmp']);
  const thumbs = thumbsDirOf(mediaDir);
  expect(await Bun.file(join(thumbs, 'a.bmp.jpg')).exists()).toBe(true);
  expect(await Bun.file(join(thumbs, 'b.bmp.jpg')).exists()).toBe(true);
  expect(await Bun.file(join(thumbs, 'gone.bmp.jpg')).exists()).toBe(false);
});
