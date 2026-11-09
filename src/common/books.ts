import type { BookKind, Years } from './types';

// Each kind of church book by its Astia series name.
export const BOOK_NAMES: Record<BookKind, string> = {
  rippi: 'Pää- ja rippikirjat',
  lasten: 'Lastenkirjat',
  kastetut: 'Syntyneiden ja kastettujen luettelot',
  vihityt: 'Vihittyjen luettelot'
};

// A cited church book by its series name and years, then the page:
// "Pää- ja rippikirjat 1790–1796 · p. 18". What the reference doesn't give
// is left out; null when it gives none of them.
export function bookLabel(
  book: { kind: BookKind | null; years: Years | null },
  page: number | null
) {
  const { from, to } = book.years ?? { from: null, to: null };
  const years =
    from === null ? null : from === to ? `${from}` : `${from}–${to}`;
  const name = [book.kind === null ? null : BOOK_NAMES[book.kind], years]
    .filter((s) => s !== null)
    .join(' ');
  const parts = [name, page === null ? '' : `p.\u00a0${page}`];
  const named = parts.filter((s) => s !== '');
  return named.length === 0 ? null : named.join('\u00a0· ');
}
