// What the wire says of a Volume's page numbers.

import type { Provenance } from '@/common/types';

// The page numbers on an Image of a Volume, as its estimates count them
// from its Page pins (ADR-0032): `by` whom they were read on that very
// Image, null where counted from the pins around it.
export interface ImagePages {
  image: number;
  pages: number[];
  by: Provenance | null;
  // On an Image without a page, the run of Images skipped with it, both
  // ends included, where it's more than the one.
  skipped?: { from: number; to: number };
}

// A Volume's pages as the Scan viewer and the Volumes tab show them: on
// each of its Images, and what's known of its page numbers.
export interface VolumePages {
  images: ImagePages[];
  numbering: PageNumbering;
}

// What's known of a Volume's page numbers: none read or set (`counted` as
// its book is numbered), some read or set, all marked checked by hand, or
// marked by hand as having none (`none`). Either mark locks them.
export type PageNumbering = 'counted' | 'read' | 'checked' | 'none';

// A hand's mark on a Volume's page numbers, or null for none.
export type PageMark = 'checked' | 'none';
