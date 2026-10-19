// A Link's words, shared by the person panel and the Scan viewer: its
// name and what it means, and for a reference with none, why.

import type { Certainty, LinkTarget, Precision, Unlinked } from '@common/types';

const CERTAINTY: Record<Certainty, string> = {
  marked: 'Marked',
  vision: 'Vision match',
  estimated: 'Estimated'
};

const PRECISION: Record<Precision, string> = {
  entry: '',
  image: ' Image',
  volume: ' Volume'
};

// Who says where a Link points, by name.
export function certaintyName(certainty: Certainty) {
  return CERTAINTY[certainty];
}

// A Link's name: who says so, then how far down unless it's the entry.
export function linkLabel(link: LinkTarget) {
  return `${CERTAINTY[link.certainty]}${PRECISION[link.precision]}`;
}

// What the name means; an estimate says what it was counted from.
export function linkHint(link: LinkTarget) {
  if (link.certainty === 'vision') {
    return 'The vision model found the name on this Image. Not checked yet: confirm it, or mark the right Image.';
  }
  if (link.certainty === 'marked') {
    switch (link.precision) {
      case 'entry':
        return 'A person marked this record on this Image.';
      case 'image':
        return "A person marked this record on this Image; where on it isn't marked.";
      case 'volume':
        return "A person said the record is in this Volume; its Image isn't marked.";
    }
  }
  if (link.precision === 'volume') {
    return "Only the Volume is known, chosen from what the citation gives; it may be the wrong one, and the Image isn't known.";
  }
  return link.precision === 'image' && link.from === 'pins'
    ? "Counted from page numbers read in this Volume; the record itself isn't checked."
    : 'Guessed from the usual pages per Image for this kind of book; often a few Images off.';
}

// A Split reference's row says it may be elsewhere.
export const SPLIT_NOTE = 'one of several Volumes';

export function splitLabel(label: string) {
  return `${label} · ${SPLIT_NOTE}`;
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
