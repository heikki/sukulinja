// A Link's words, shared by the person panel and the Scan viewer: its
// name, and for a reference with none, why.

import type {
  BookKind,
  Certainty,
  CitedBook,
  LinkTarget,
  Unlinked
} from '@/common/types';

const CERTAINTY: Record<Certainty, string> = {
  marked: 'Marked',
  match: 'Match',
  estimated: 'Estimate'
};

// Who says where a Link points, by name.
export function certaintyName(certainty: Certainty) {
  return CERTAINTY[certainty];
}

// A Link's name: who says so, however far down it points.
export function linkLabel(link: LinkTarget) {
  return certaintyName(link.certainty);
}

// A Volume's name without the archive's code for it ("I Aa:8"), which the
// archive's name stands in for: "Pää- ja rippikirjat (1783-1790)".
export function volumeTitle(label: string) {
  return label.replace(/^[IVX]+\s+[A-Za-z]+:\s*\d+[a-z]?\s+/u, '');
}

// Why a reference has no Link: it couldn't be looked for ("No scan"), it
// was looked for in the parish's books and not found, or Astia failed and
// it may be found later.
const UNLINKED: Record<Unlinked, { label: string; hint: string }> = {
  'unparsed': {
    label: 'No scan',
    hint: "The reference couldn't be read as parish, book and years."
  },
  'no-archive': {
    label: 'No scan',
    hint: "The app doesn't know which Astia archive holds this parish."
  },
  'no-volume': {
    label: 'Not found',
    hint: "The parish's books were found, but none for these years."
  },
  'not-digitized': {
    label: 'Not found',
    hint: "Its Volume isn't digitized in Astia."
  },
  'no-images': {
    label: 'Not found',
    hint: 'Astia lists the Volume but has no Images for it.'
  },
  'astia-error': {
    label: 'Astia error',
    hint: "Astia couldn't be reached or gave no answer. Open the person again to retry."
  }
};

export function unlinkedLabel(reason: Unlinked) {
  return UNLINKED[reason].label;
}

export function unlinkedHint(reason: Unlinked) {
  return UNLINKED[reason].hint;
}

// A kind of church book in a sentence: "Mikkeli has no baptism Volume".
const BOOK_NOUN: Record<BookKind, string> = {
  rippi: 'communion book',
  lasten: "children's book",
  kastetut: 'baptism',
  vihityt: 'marriage'
};

function yearsText({ from, to }: { from: number; to: number }) {
  return from === to ? `${from}` : `${from}–${to}`;
}

// What's missing for a reference whose parish's books were looked through,
// naming its parish, Book and years: "Mikkeli has no baptism Volume for
// 1779." Without them, the reason's hint.
export function missingText(reason: Unlinked, cited: CitedBook | null) {
  if (cited === null) return unlinkedHint(reason);
  const { parish, kind, years } = cited;
  if (parish === null || kind === null || years === null) {
    return unlinkedHint(reason);
  }
  const noun = BOOK_NOUN[kind];
  const when = yearsText(years);
  if (reason === 'no-volume') {
    return `${parish} has no ${noun} Volume for ${when}.`;
  }
  if (reason === 'not-digitized') {
    return `${parish}'s ${noun} Volume for ${when} isn't digitized in Astia.`;
  }
  if (reason === 'no-images') {
    return `Astia has no Images of ${parish}'s ${noun} Volume for ${when}.`;
  }
  return unlinkedHint(reason);
}
