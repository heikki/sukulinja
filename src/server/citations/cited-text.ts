// What a Citation's reference says in brief, as the panel and the Scan
// viewer show it.

import { bookLabel } from '@/common/books';
import { gedcomDate, isoDate } from '@/common/dates';

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
// where the reference says it is: its page or date, or for a Citation of
// an Image, its Entry's page number, else its Event's date (ADR-0039).
export function entriesOf(
  book: BookRef | null,
  stored: { image: number } | null,
  {
    entryBookPage,
    entryDate
  }: {
    entryBookPage: number | null;
    entryDate: string | null;
  }
) {
  if (book !== null) {
    const entry = entryOf(book);
    return { entry, referenceEntry: entry };
  }
  if (stored === null) return { entry: null, referenceEntry: null };
  const entry = `Image\u00a0${stored.image}`;
  if (entryBookPage !== null) {
    return { entry, referenceEntry: `p.\u00a0${entryBookPage}` };
  }
  return {
    entry,
    referenceEntry: entryDate === null ? null : gedcomDate(entryDate)
  };
}
