// A Volume's page numbering (ADR-0031, ADR-0032): from its Page pins and
// the kind of its book, where a page is and which pages are on an Image,
// both counted one way, so the page shown on an Image is where the
// estimates put that page.
//
// With Page pins, a page is counted within each Page run the pins reach
// (runs.ts), Images set to have no page left out (unnumbered.ts): between
// two pins proportionally, which spreads unnumbered or inserted leaves
// over the gap, elsewhere from the nearest pin at its pace. The pages on
// an Image are those placed on it; an Image no page is placed on (more
// Images than pages between two pins) shows the pages before it.
//
// Without any, a book is counted from its first Image: rippikirjat one
// number a spread, lastenkirjat two, and a cited rippikirja page that
// wouldn't fit the Volume by spread two as well. That last is a guess for
// one cited page past the end, not how the Volume is numbered, so the
// pages shown on its Images stay one a spread.

import type {
  BookKind,
  ImagePages,
  PageMark,
  PageNumbering as Known,
  Provenance
} from '@/common/types';

import { runsOf } from './runs';
import type { PageRun } from './runs';
import { skipping } from './unnumbered';

export { pageClash, SAME_PAGE_IMAGES } from './runs';

// What a Page pin tells the counting: a Page number on an Image, one a
// spread or a page's two, or none for an Image without one. A missing
// `by` is by hand.
export interface NumberedPin {
  image: number;
  pages: number[];
  by?: Provenance;
}

// Where a Page run puts a page.
export interface PagePlace {
  image: number;
}

export type Placing =
  // Counted from the Page pins: one place for each run reaching the page,
  // none when no run does.
  | { from: 'pins'; places: PagePlace[] }
  // Counted from the Volume's first Image, without Page pins; null past
  // its end.
  | { from: 'numbering'; image: number | null };

export interface PageNumbering {
  // Where the page is.
  place: (page: number) => Placing;
  // The pages on each Image, as `place` counts them: a pin's own where
  // one is (by who set it), else counted (by null); [] on an Image set to
  // have no page.
  pages: () => ImagePages[];
  // The pages a new Page pin of `page` gives an Image: the page and the
  // next where the Volume numbers pages, as its pins do or, without any,
  // a lastenkirja.
  pinPages: (page: number) => number[];
}

interface Pace {
  image: number;
  first: number;
  pagesPerImage: number;
}

const BY_SPREAD: Pace = { image: 1, first: 1, pagesPerImage: 1 };
const BY_PAGE: Pace = { image: 1, first: 0, pagesPerImage: 2 };

function imageFor(n: Pace, page: number) {
  return n.image + Math.floor((page - n.first) / n.pagesPerImage);
}

// Counted from the book's first Image: by spread, unless it's a
// lastenkirja or the page wouldn't fit the Volume that way.
function numberedImage(kind: BookKind | null, page: number, images: number) {
  const spread = imageFor(BY_SPREAD, page);
  return kind === 'lasten' || spread > images
    ? imageFor(BY_PAGE, page)
    : spread;
}

// The pages a Volume without Page pins shows on the Image: a
// lastenkirja's two, any other book's one.
function numberedPages(kind: BookKind | null, image: number) {
  return kind === 'lasten'
    ? [2 * image - 2, 2 * image - 1].filter((p) => p > 0)
    : [image];
}

function paces(pins: NumberedPin[]): Pace[] {
  return pins
    .filter((a) => a.pages.length > 0)
    .map((a) => ({
      image: a.image,
      first: Math.min(...a.pages),
      pagesPerImage: a.pages.length
    }))
    .sort((a, b) => a.first - b.first);
}

// Between two Page pins a page is placed proportionally; elsewhere it's
// counted from the nearest one. Page pins out of image order (a misread
// page) are only counted from.
function countedImage(numbered: Pace[], page: number) {
  const lo = numbered.filter((n) => n.first <= page).at(-1);
  const hi = numbered.find((n) => n.first > page);
  if (lo === undefined || hi === undefined) {
    const only = lo ?? hi;
    return only === undefined ? null : imageFor(only, page);
  }
  if (page < lo.first + lo.pagesPerImage) return lo.image;
  if (hi.image > lo.image) {
    const share = (page - lo.first) / (hi.first - lo.first);
    return lo.image + Math.floor(share * (hi.image - lo.image));
  }
  return imageFor(page - lo.first <= hi.first - page ? lo : hi, page);
}

// One run, counted: where it puts a page, if it reaches it (an aside
// giving the page as cited places it), and the pages it puts on each of
// its Images.
function countedRun(run: PageRun) {
  const numbered = paces(run.pins);
  function place(page: number) {
    const aside = run.asides.find((a) => a.pages.includes(page));
    const image = aside?.image ?? countedImage(numbered, page);
    return image !== null && image >= run.from && image <= run.to
      ? image
      : null;
  }
  function pages() {
    const firsts = run.pins.map((p) => Math.min(...p.pages));
    const lowest = Math.max(1, Math.min(...firsts) - 2 * run.to);
    const highest = Math.max(...firsts) + 2 * run.to + 1;
    const placed = new Map<number, number[]>();
    const wanted = [
      ...Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i),
      ...run.asides.flatMap((a) => a.pages)
    ];
    for (const page of new Set(wanted)) {
      const image = place(page);
      if (image !== null) {
        placed.set(image, [...(placed.get(image) ?? []), page]);
      }
    }
    const shown: ImagePages[] = [];
    for (let image = run.from; image <= run.to; image += 1) {
      const pin = [...run.pins, ...run.asides].find((p) => p.image === image);
      const counted = placed.get(image);
      if (pin !== undefined) {
        shown.push({ image, pages: pin.pages, by: pin.by ?? 'hand' });
      } else if (counted !== undefined) {
        shown.push({
          image,
          pages: counted.toSorted((a, b) => a - b),
          by: null
        });
      } else if (shown.length > 0) {
        shown.push({ image, pages: shown.at(-1)!.pages, by: null });
      }
    }
    // Images before the first page placed show the first.
    const head = shown[0];
    if (head === undefined) return shown;
    const before = Array.from({ length: head.image - run.from }, (_, i) => ({
      image: run.from + i,
      pages: head.pages,
      by: null
    }));
    return [...before, ...shown];
  }
  return { place, pages };
}

// The numbering of a Volume of `images` Images, its Page pins `pins` (of
// the filming shown) and its book `kind`.
export function pageNumbering(
  pins: NumberedPin[],
  images: number,
  kind: BookKind | null
): PageNumbering {
  const s = skipping(pins, images);
  const runs = runsOf(s.pins, s.images).map(countedRun);
  const skipped: ImagePages[] = s.skipped.map((image) => ({
    image,
    pages: [],
    by: 'hand'
  }));

  function place(page: number): Placing {
    if (runs.length === 0) {
      const at = numberedImage(kind, page, s.images);
      return {
        from: 'numbering',
        image: at < 1 || at > s.images ? null : s.image(at)
      };
    }
    return {
      from: 'pins',
      places: runs.flatMap((run) => {
        const at = run.place(page);
        return at === null ? [] : [{ image: s.image(at) }];
      })
    };
  }

  function pages() {
    const counted =
      runs.length === 0
        ? Array.from({ length: s.images }, (_, i) => ({
            image: i + 1,
            pages: numberedPages(kind, i + 1),
            by: null
          }))
        : runs.flatMap((run) => run.pages());
    // Runs overlap between their pins: an Image there shows the earlier.
    const seen = new Set<number>();
    const shown = counted.filter((p) => {
      if (seen.has(p.image)) return false;
      seen.add(p.image);
      return true;
    });
    return [
      ...shown.map((p) => ({ ...p, image: s.image(p.image) })),
      ...skipped
    ].toSorted((a, b) => a.image - b.image);
  }

  function pinPages(page: number) {
    const numbered = s.pins;
    const twoPages =
      numbered.length > 0
        ? numbered.some((p) => p.pages.length === 2)
        : kind === 'lasten';
    return twoPages ? [page, page + 1] : [page];
  }

  return { place, pages, pinPages };
}

// How many of a Volume's Images have their pages read or set, and how
// many of those were set by hand, which a page survey takes away.
export function pageCounts(images: ImagePages[]) {
  return {
    pinned: images.filter((p) => p.by !== null).length,
    byHand: images.filter((p) => p.by === 'hand').length
  };
}

// What's known of a Volume's page numbers: its mark, else whether any of
// its pages are read or set.
export function numberingOf(
  mark: PageMark | undefined,
  pinned: boolean
): Known {
  if (mark !== undefined) return mark;
  return pinned ? 'read' : 'counted';
}

// Whether the Volume's page numbers are locked: marked checked, or as
// having none. Nothing changes them then until they're unmarked.
export function isLocked(numbering: Known) {
  return numbering === 'checked' || numbering === 'none';
}

// Why a change to locked page numbers is refused, by their mark.
export const LOCKED: Record<PageMark, string> = {
  checked:
    'The page numbers of this Volume are marked checked. Unmark them to change them.',
  none: 'This Volume is marked as having no page numbers. Unmark it to change them.'
};

// The Images of a Volume marked as having no page numbers: none on any.
export function unnumbered(images: number): ImagePages[] {
  return Array.from({ length: images }, (_, i) => ({
    image: i + 1,
    pages: [],
    by: null
  }));
}
