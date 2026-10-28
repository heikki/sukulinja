// An Image's size in pixels, read from its JPEG header: what a Box in
// pixels lies within.

export interface Viewport {
  width: number;
  height: number;
}

// The start-of-frame markers, which give the size: every SOFn but DHT
// (C4), JPG (C8) and DAC (CC).
function isFrame(marker: number) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

// The JPEG's width and height, or null when it isn't one or has no frame.
export function jpegSize(bytes: Uint8Array): Viewport | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (isFrame(marker)) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}
