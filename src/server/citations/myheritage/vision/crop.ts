// Cuts a region out of an image with nothing but Bun: Bun.Image decodes,
// scales and encodes, but has no crop, so the image goes through a PNG of
// its raw pixels, whose rows are cut here and written back as a PNG.

import { unzlibSync, zlibSync } from 'fflate';

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
// Bytes a pixel takes, by PNG colour type: grey, RGB, grey+alpha, RGBA.
const CHANNELS: Partial<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

interface Raw {
  width: number;
  height: number;
  colorType: number;
  channels: number;
  // Unfiltered rows, one after another.
  pixels: Uint8Array;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Takes each row's filter off, in place into `out`.
function unfilter(data: Uint8Array, raw: Omit<Raw, 'pixels'>) {
  const stride = raw.width * raw.channels;
  const out = new Uint8Array(stride * raw.height);
  const bpp = raw.channels;
  for (let y = 0; y < raw.height; y++) {
    const filter = data[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    const at = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = data[from + x]!;
      const left = x >= bpp ? out[at + x - bpp]! : 0;
      const up = y > 0 ? out[at - stride + x]! : 0;
      const upLeft = y > 0 && x >= bpp ? out[at - stride + x - bpp]! : 0;
      const add = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][
        filter
      ];
      if (add === undefined) throw new Error(`PNG filter ${filter} unknown`);
      out[at + x] = (v + add) & 0xff;
    }
  }
  return out;
}

export function readPng(png: Uint8Array): Raw {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let head: Omit<Raw, 'pixels'> | null = null;
  const data: Uint8Array[] = [];
  for (let off = SIGNATURE.length; off < png.length;) {
    const length = view.getUint32(off);
    const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
    const body = png.subarray(off + 8, off + 8 + length);
    if (type === 'IHDR') {
      const colorType = body[9]!;
      const channels = CHANNELS[colorType];
      if (body[8] !== 8 || channels === undefined || body[12] !== 0) {
        throw new Error('PNG not 8-bit, not interlaced, without a palette');
      }
      head = {
        width: view.getUint32(off + 8),
        height: view.getUint32(off + 12),
        colorType,
        channels
      };
    }
    if (type === 'IDAT') data.push(body);
    off += 12 + length;
  }
  if (head === null) throw new Error('PNG without a header');
  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of data) {
    joined.set(d, at);
    at += d.length;
  }
  return { ...head, pixels: unfilter(unzlibSync(joined), head) };
}

function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(
    8 + body.length,
    Bun.hash.crc32(out.subarray(4, 8 + body.length))
  );
  return out;
}

export function writePng(raw: Raw) {
  const stride = raw.width * raw.channels;
  const rows = new Uint8Array((stride + 1) * raw.height);
  for (let y = 0; y < raw.height; y++) {
    rows.set(
      raw.pixels.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1
    );
  }
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, raw.width);
  view.setUint32(4, raw.height);
  head.set([8, raw.colorType, 0, 0, 0], 8);
  const parts = [
    SIGNATURE,
    chunk('IHDR', head),
    chunk('IDAT', zlibSync(rows, { level: 1 })),
    chunk('IEND', new Uint8Array())
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// A part of an image, in pixels from its top left.
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The image `input` (any format Bun.Image reads) cut to `box`, as a PNG.
export async function cropImage(input: Uint8Array | string, box: PixelBox) {
  const png = await new Bun.Image(input).png({ compressionLevel: 0 }).bytes();
  const raw = readPng(png);
  const left = Math.max(0, Math.min(box.left, raw.width - 1));
  const top = Math.max(0, Math.min(box.top, raw.height - 1));
  const width = Math.min(box.width, raw.width - left);
  const height = Math.min(box.height, raw.height - top);
  const stride = raw.width * raw.channels;
  const cut = width * raw.channels;
  const pixels = new Uint8Array(cut * height);
  for (let y = 0; y < height; y++) {
    const from = (top + y) * stride + left * raw.channels;
    pixels.set(raw.pixels.subarray(from, from + cut), y * cut);
  }
  return writePng({ ...raw, width, height, pixels });
}
