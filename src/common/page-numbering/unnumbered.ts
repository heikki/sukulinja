// Images a Page pin with no pages says carry no page number: a cover, a
// blank or inserted leaf, set so by hand in the Scan viewer (ADR-0032).
// Two such pins with no other pin between them skip every Image between
// too, so a long run of leaves without numbers is set at its two ends
// (Heikki, 2026-11-24); one kept `alone` skips only its own Image, as a
// Volume's pins saved before did (migrated once by hand: joiningSkips,
// run by scripts/join-skips.ts).
// Counting a Volume's pages leaves them out, as if they weren't filmed:
// the counting is done over the other Images, numbered on from 1, and
// what it gives is turned back into the Volume's own Image numbers.

import type { NumberedPin } from './index';

// Images skipped together, both ends included: a lone skip is one long.
export interface SkippedRun {
  from: number;
  to: number;
}

type Mark = 'skip' | 'alone' | 'page';

// What an Image's pins say of it, `was` what those before said: a skip
// wins over a page, and joins unless every skip there is alone.
function markOf(was: Mark | undefined, pin: NumberedPin): Mark {
  if (pin.pages.length > 0) return was ?? 'page';
  if (pin.alone === true) return was === 'skip' ? 'skip' : 'alone';
  return 'skip';
}

// The Images the pins skip, as runs in Image order, those touching joined.
// An Image with a skipping pin is skipped whatever else is pinned there.
export function skippedRuns(pins: NumberedPin[]): SkippedRun[] {
  const marks = new Map<number, Mark>();
  for (const p of pins) marks.set(p.image, markOf(marks.get(p.image), p));
  const runs: SkippedRun[] = [];
  // Whether the last mark is a skip the next one joins.
  let joins = false;
  for (const [image, mark] of [...marks].toSorted(([a], [b]) => a - b)) {
    const last = runs.at(-1);
    if (mark === 'page') {
      joins = false;
    } else if (
      last !== undefined &&
      ((mark === 'skip' && joins) || last.to === image - 1)
    ) {
      last.to = image;
      joins = mark === 'skip';
    } else {
      runs.push({ from: image, to: image });
      joins = mark === 'skip';
    }
  }
  return runs;
}

// The run of two or more Images the Image is skipped in, if any.
export function runOf(pins: NumberedPin[], image: number) {
  return (
    skippedRuns(pins).find(
      (r) => r.to > r.from && r.from <= image && image <= r.to
    ) ?? null
  );
}

export function skipping<P extends NumberedPin>(pins: P[], images: number) {
  const runs = skippedRuns(pins);
  const skipped = runs.flatMap((r) =>
    Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)
  );
  const isSkipped = new Set(skipped);
  function counted(image: number) {
    return image - skipped.filter((s) => s < image).length;
  }
  return {
    skipped,
    runs,
    // The numbered pins, at their Images among the counted ones.
    pins: pins
      .filter((p) => p.pages.length > 0 && !isSkipped.has(p.image))
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

// Where a page set on the Image splits the run it's skipped in, the
// Images that need a pin of no pages for the rest to stay skipped: those
// either side of it, within the run, with no pin of their own.
export function splitSkips(pins: NumberedPin[], image: number) {
  const run = runOf(pins, image);
  if (run === null) return [];
  return [image - 1, image + 1].filter(
    (i) => i >= run.from && i <= run.to && !pins.some((p) => p.image === i)
  );
}

// A Volume's pins saved before two skips joined (2026-11-24), kept
// skipping just what they did: of the pins `isCurrent` says are made on
// the filming shown, as only those are counted, a run of skipped Images
// apart from any other skip by a numbered pin, with none inside it, is
// kept at its two ends, and any other skip is kept `alone`, every Image of
// its run; a pin of another filming is kept as it was, a skip `alone`.
export function joiningSkips<P extends NumberedPin>(
  pins: P[],
  isCurrent: (pin: P) => boolean = () => true
): P[] {
  function alone(p: P) {
    return p.pages.length === 0 ? { ...p, alone: true } : p;
  }
  const current = pins.filter(isCurrent).map(alone);
  const stale = pins.filter((p) => !isCurrent(p)).map(alone);
  return [...keptJoining(current), ...stale].toSorted(
    (a, b) => a.image - b.image
  );
}

// The current pins, every skip alone, with each run apart from any other
// skip kept at its two ends, joining.
function keptJoining<P extends NumberedPin>(old: P[]): P[] {
  const runs = skippedRuns(old);
  const numbered = old.filter((p) => p.pages.length > 0).map((p) => p.image);
  // Whether a numbered pin is on an Image from `a` to `b`.
  function numberedIn(a: number, b: number) {
    return numbered.some((m) => m >= a && m <= b);
  }
  const ends = new Set(
    runs.filter((r, i) => {
      const before = runs[i - 1];
      const after = runs[i + 1];
      return (
        r.to > r.from &&
        !numberedIn(r.from, r.to) &&
        (before === undefined || numberedIn(before.to + 1, r.from - 1)) &&
        (after === undefined || numberedIn(r.to + 1, after.from - 1))
      );
    })
  );
  const out: P[] = [];
  for (const p of old) {
    const run = runs.find((r) => r.from <= p.image && p.image <= r.to);
    if (p.pages.length > 0 || run === undefined || !ends.has(run)) {
      out.push(p);
    } else if (p.image === run.from || p.image === run.to) {
      const { alone: _, ...joined } = p as P & { alone?: boolean };
      out.push(joined as P);
    }
  }
  return out;
}
