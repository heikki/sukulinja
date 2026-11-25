// What a Citation's reference says in brief, as the panel and the Scan
// viewer show it.

import { bookLabel } from '@/common/books';
import { isoDate } from '@/common/dates';

import type { BookRef } from './references';

// Parish · book and years · page, of what the reference gives. Lines break
// only after a dot.
export function describeRef(ref: BookRef) {
  const named = [ref.parish, bookLabel(ref, ref.page)].filter(
    (s) => s !== null
  );
  return named.length === 0 ? null : named.join('\u00a0· ');
}

// Where in its Volume the reference points: the page, else the entry's date.
export function entryOf(ref: BookRef) {
  if (ref.page !== null) return `p.\u00a0${ref.page}`;
  return ref.date === null ? null : isoDate(ref.date);
}

// Where in its Volume the reference points (`book`), or the Image a
// Citation of one cites (`stored`): its `entry`. Its `referenceEntry` is
// the reference's alone, also the one a Citation of an Image was
// converted from (ADR-0016), and null for one made on an Image.
export function entriesOf(
  book: BookRef | null,
  stored: { image: number } | null,
  convertedFrom: () => BookRef | null
) {
  if (book !== null) {
    const entry = entryOf(book);
    return { entry, referenceEntry: entry };
  }
  if (stored === null) return { entry: null, referenceEntry: null };
  const ref = convertedFrom();
  const entry = `Image\u00a0${stored.image}`;
  return { entry, referenceEntry: ref === null ? null : entryOf(ref) };
}
