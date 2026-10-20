import type { BookKind } from './types';

// Each kind of church book by its Astia series name.
export const BOOK_NAMES: Record<BookKind, string> = {
  rippi: 'Pää- ja rippikirjat',
  lasten: 'Lastenkirjat',
  kastetut: 'Syntyneiden ja kastettujen luettelot',
  vihityt: 'Vihittyjen luettelot'
};
