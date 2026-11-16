// Images a Page pin with no pages says carry no page number: a cover, a
// blank or inserted leaf, set so by hand in the Scan viewer (ADR-0032).
// Counting a Volume's pages leaves them out, as if they weren't filmed:
// the counting is done over the other Images, numbered on from 1, and
// what it gives is turned back into the Volume's own Image numbers.

import type { NumberedPin } from './index';

export function skipping<P extends NumberedPin>(pins: P[], images: number) {
  const skipped = [
    ...new Set(pins.filter((p) => p.pages.length === 0).map((p) => p.image))
  ].toSorted((a, b) => a - b);
  function counted(image: number) {
    return image - skipped.filter((s) => s < image).length;
  }
  return {
    skipped,
    // The numbered pins, at their Images among the counted ones.
    pins: pins
      .filter((p) => p.pages.length > 0 && !skipped.includes(p.image))
      .map((p) => ({ ...p, image: counted(p.image) })),
    images: images - skipped.length,
    // The Volume's Image of a counted one.
    image(at: number) {
      let image = at;
      for (const s of skipped) if (s <= image) image += 1;
      return image;
    }
  };
}
