import type { BookKind, CitationRow, Years } from './types';

// Each kind of church book by its Astia series name.
export const BOOK_NAMES: Record<BookKind, string> = {
  rippi: 'Pää- ja rippikirjat',
  lasten: 'Lastenkirjat',
  kastetut: 'Syntyneiden ja kastettujen luettelot',
  vihityt: 'Vihittyjen luettelot'
};

// The kind of church book a name gives, a Volume's label or a reference's
// "Kirja"; null for any other.
export function bookKind(name: string): BookKind | null {
  if (/lasten/i.test(name)) return 'lasten';
  if (/ripp|pääkirj|kirkonkirj|historiakirj/i.test(name)) return 'rippi';
  if (/synty|kastet/i.test(name)) return 'kastetut';
  if (/vihit|kuulut/i.test(name)) return 'vihityt';
  return null;
}

// The Roles a person may have in an entry of the kind of book, GEDCOM's
// citation ROLE, as a new entry offers them: for a baptism or a
// marriage. A household's line has none: isäntä or piika is who they are
// in the household, which its transcription says.
export const ENTRY_ROLES: Partial<
  Record<BookKind, ReadonlyArray<{ role: string; label: string }>>
> = {
  kastetut: [
    { role: 'CHIL', label: 'Child' },
    { role: 'FATH', label: 'Father' },
    { role: 'MOTH', label: 'Mother' }
  ],
  vihityt: [
    { role: 'HUSB', label: 'Groom' },
    { role: 'WIFE', label: 'Bride' }
  ]
};

// The Roles an entry in the Volume of the label may give.
export function entryRoles(volume: string) {
  const kind = bookKind(volume);
  return (kind === null ? undefined : ENTRY_ROLES[kind]) ?? [];
}

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

// A Church-book reference as the lists name it: by its Book and page when
// they could be read, else as it was written.
export function referenceName(
  citation: Pick<CitationRow, 'cited' | 'citedPage' | 'reference' | 'entry'>
) {
  const { cited } = citation;
  const book = cited === null ? null : bookLabel(cited, citation.citedPage);
  return book ?? citation.reference ?? citation.entry;
}
