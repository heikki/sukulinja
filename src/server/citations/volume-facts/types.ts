// The facts kept of each Volume, shared by every dataset of a data
// folder: its Page pins, its page numbers' mark, and the Record ranges and
// Record pins MyHeritage's references give its film. Kept in the data
// folder's pins.local.json (files.ts), and in the Offload folder beside
// the Volume's Images (archive.ts).

import type { Box, PageMark, Provenance } from '@/common/types';

// A pin on an Image keeps that Image's Astia file id, which tells the
// filming it was made on: after a re-scan the Image number is another
// page, and the pin is left out (see filming.ts).
export interface PagePin {
  image: number;
  pages: number[];
  // On a pin of no pages, that it skips its own Image only, not those
  // between it and the next such pin (see common/page-numbering).
  alone?: boolean;
  note?: string;
  by?: Provenance;
  fileId?: string;
}

// MyHeritage record numbers, both ends included.
export interface RecordRange {
  from: number;
  to: number;
}

// A record known to be on this image, by its MyHeritage Record number.
export interface RecordPin {
  record: number;
  image: number;
  by?: Provenance;
  // Where on the Image the entry is, where the vision model said.
  box?: Box;
  fileId?: string;
}

// What's known of one volume: its Page pins, the villages found in it where
// a book is split in parts without village ranges in their labels, the
// Record ranges on its film, and its Record pins.
export interface VolumePins {
  title?: string;
  pages: PagePin[];
  // The Volume's page numbers marked by hand: 'checked', looked over and
  // locked until unmarked; 'none', having no page numbers, locked so, and
  // a cited page places nothing in it.
  mark?: PageMark;
  // When it last changed (ISO), for the copy in the offload folder: the
  // later of the two is kept whole.
  saved?: string;
  villages?: string[];
  ranges?: RecordRange[];
  records?: RecordPin[];
}

// One reference known to be in a volume, and on which image when known:
// one naming no page, found in a volume its book doesn't match, or pinned
// to its volume alone. Kept by the reference's URL.
export interface ReferencePin {
  volumeId: string;
  volume: string;
  image?: number;
  by?: Provenance;
  box?: Box;
  fileId?: string;
}

export interface Pins {
  volumes: Record<string, VolumePins>;
  references: Record<string, ReferencePin>;
}

// Whether a pin was saved by hand: pins say who saved them, and a missing
// `by` is by hand, which covers every local file written before the
// vision model.
export function isHand(pin: { by?: string }) {
  return pin.by !== 'vision';
}
