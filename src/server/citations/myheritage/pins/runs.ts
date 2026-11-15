// A Volume's Page pins as runs of page numbering: a Volume may number its
// pages over again partway through (parts of one book, each from page 1),
// so the same page number can be on Images far apart. In Image order, a
// run goes on while the numbers do, and a new one starts where they go
// back. Most Volumes are one run, and then this is just the pins in order.
//
// A pin whose number goes back while the next one carries on the run, at
// its pace, better than it would carry on a run started there, is no new
// run but an aside: a Mark of a page MyHeritage misread, where the pin
// gives the number as cited. It places that page only.

import type { PagePin } from './locate';

// How far apart two Page pins of the same page may be and still be one
// page pinned twice, the later one moving it: further, it's a page of
// another run.
export const SAME_PAGE_IMAGES = 10;

export interface PageRun {
  pins: PagePin[];
  asides: PagePin[];
  // The Images the run can reach: from just after the run before it to
  // just before the next.
  from: number;
  to: number;
}

function first(pin: PagePin) {
  return Math.min(...pin.pages);
}

// Pages an Image the run goes at: one number a spread unless its pins
// show otherwise.
function pace(run: PagePin[]) {
  const [a, b] = [run[0]!, run.at(-1)!];
  if (a === b) return a.pages.length;
  return (first(b) - first(a)) / (b.image - a.image);
}

// Where a run at `perImage` from `from` would be numbered on `pin`'s Image.
function expected(from: PagePin, perImage: number, pin: PagePin) {
  return first(from) + (pin.image - from.image) * perImage;
}

// Whether `next` carries on `run` past `pin` better than a run starting
// at `pin` would reach it.
function carriesOn(run: PagePin[], pin: PagePin, next: PagePin) {
  const perImage = pace(run);
  const old = Math.abs(first(next) - expected(run.at(-1)!, perImage, next));
  const fresh = Math.abs(first(next) - expected(pin, perImage, next));
  return first(next) >= first(run.at(-1)!) && old < fresh;
}

function numbered(pins: PagePin[]) {
  return pins
    .filter((p) => p.pages.length > 0)
    .toSorted((a, b) => a.image - b.image);
}

// The Volume's runs, over its `images`.
export function runsOf(pins: PagePin[], images: number): PageRun[] {
  const list = numbered(pins);
  const runs: Array<Pick<PageRun, 'pins' | 'asides'>> = [];
  for (const [i, pin] of list.entries()) {
    const run = runs.at(-1);
    const last = run?.pins.at(-1);
    const next = list[i + 1];
    if (run === undefined || last === undefined) {
      runs.push({ pins: [pin], asides: [] });
    } else if (first(pin) >= first(last)) {
      run.pins.push(pin);
    } else if (next !== undefined && carriesOn(run.pins, pin, next)) {
      run.asides.push(pin);
    } else {
      runs.push({ pins: [pin], asides: [] });
    }
  }
  return runs.map((run, i) => ({
    ...run,
    from: i === 0 ? 1 : runs[i - 1]!.pins.at(-1)!.image + 1,
    to: i === runs.length - 1 ? images : runs[i + 1]!.pins[0]!.image - 1
  }));
}

// Whether two Page pins pin the same thing, so a newer one replaces the
// other: on the same Image, or the same page near enough to be one run's.
export function pageClash(pin: PagePin) {
  return (p: PagePin) =>
    p.image === pin.image ||
    (Math.abs(p.image - pin.image) <= SAME_PAGE_IMAGES &&
      p.pages.some((n) => pin.pages.includes(n)));
}
