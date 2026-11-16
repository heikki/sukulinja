import { expect, test } from 'bun:test';

import { readPng, writePng } from './crop';
import { fitted } from './images';

// A made-up scan, 4000 × 3000: dark, with its top right corner white.
function scan() {
  const width = 4000;
  const height = 3000;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < 750; y++) {
    pixels.fill(255, (y * width + 2400) * 3, (y * width + width) * 3);
  }
  return writePng({ width, height, colorType: 2, channels: 3, pixels });
}

// The mean of the first channel of every pixel, 0 to 255.
async function brightness(bytes: Uint8Array) {
  const png = await new Bun.Image(bytes).png({ compressionLevel: 0 }).bytes();
  const { pixels, channels } = readPng(png);
  let sum = 0;
  for (let i = 0; i < pixels.length; i += channels) sum += pixels[i]!;
  return sum / (pixels.length / channels);
}

test('a scan is scaled to what the models take', async () => {
  const sent = await fitted(scan(), null);
  expect(sent.width * sent.height).toBeLessThanOrEqual(3.75e6);
  expect(sent.width / sent.height).toBeCloseTo(4 / 3, 2);
  const meta = await new Bun.Image(sent.bytes).metadata();
  expect(meta).toEqual({
    format: 'jpeg',
    width: sent.width,
    height: sent.height
  });
});

test('a region of it is cut out and enlarged to what the models take', async () => {
  const corner = { left: 0.6, top: 0, width: 0.4, height: 0.25 };
  const sent = await fitted(scan(), corner);
  // 1600 × 750 in the scan.
  expect(sent).toMatchObject({ width: 2576, height: 1208 });
  // All of it from the white corner; the whole scan mostly dark.
  expect(await brightness(sent.bytes)).toBeGreaterThan(250);
  expect(await brightness((await fitted(scan(), null)).bytes)).toBeLessThan(40);
});
