// The Church-book references a source program's citations make, as the
// rest of the Citations reach them (ADR-0016). citations.ts knows two kinds
// of Citation: a Citation of an Image, whose Link is stored on it, and a
// reference, which a References port reads and resolves. Today's one port
// is MyHeritage's (myheritage/); once no reference is left, noReferences
// stands in for it.

import type {
  Box,
  Link,
  LinkResolution,
  RecordView,
  VolumeChoices
} from '@/common/types';

import type { Annotation } from './annotations';
import type { BookKind, Years } from './text';

// What a Church-book reference says of the church books, whoever reads it.
export interface BookRef {
  parish: string | null;
  kind: BookKind | null;
  years: Years | null;
  page: number | null;
  // The event's date, as precise as the source gives it, for a reference
  // to an index entry; null otherwise.
  date: string | null;
}

// Where a Box is: on an Image of a Volume.
export interface BoxAt {
  volumeId: string;
  image: number;
}

// Where a Mark says the record is, in any Volume of the parish: on an
// Image, or only somewhere in the Volume. On an Image, `box` is where the
// entry is drawn, in pixels of the full-size Image, null for none; left
// out, a Match's Box on that Image is kept, as confirming one does.
export interface MarkTarget {
  volumeId: string;
  image?: number;
  box?: Box | null;
}

// What a Mark did: how far down it put the record in which Volume,
// whether it confirmed a Match on that Image, how many citations of the
// record it was written into, and the cited page it saved as a Page pin,
// if any.
export interface MarkDone {
  at: 'entry' | 'image' | 'volume';
  volume: string;
  confirmed: boolean;
  citations: number;
  pagePin: number | null;
}

// What a Discard did: in which Volume, and whether it took back a Match,
// and so made a Rejection.
export interface DiscardDone {
  volume: string;
  rejection: boolean;
}

// A citation row as a port reads it: the page its reference is read from
// (its original page, or its page), its text and its Annotation.
export interface ReferenceRow {
  page: string | null;
  text: string | null;
  annotation: Annotation;
}

interface Refused {
  rejected: string;
}

export interface References<R extends BookRef = BookRef> {
  // The reference the row makes, or null for a Citation that isn't one.
  refOf: (row: ReferenceRow) => R | null;
  // What a Mark of the reference is written for: every citation with the
  // same key shares it.
  markKey: (ref: R) => string;
  // The source's record the row's text transcribes, read into its fields
  // for display; null to show the text as it is.
  recordOf: (row: ReferenceRow) => RecordView | null;
  // Where the reference links, with what's saved so far.
  resolve: (ref: R) => Promise<LinkResolution>;
  // Each reference's Link in the Volume, or null for one resolving
  // elsewhere; null for them all when the Volume is in none of their
  // parishes.
  volumeLinks: (
    volumeId: string,
    refs: R[]
  ) => Promise<Array<Link | null> | null>;
  // The Volumes each reference links in the parish archive, by id; none
  // for one in another parish.
  archiveLinks: (archiveId: string, refs: R[]) => Promise<string[][]>;
  // Changes whenever what references resolve to may have.
  stamp: () => Promise<string>;
  mark: (
    ref: R,
    target: MarkTarget
  ) => Promise<{ resolution: LinkResolution; done: MarkDone } | Refused>;
  discard: (
    ref: R,
    at: BoxAt
  ) => Promise<{ resolution: LinkResolution; done: DiscardDone } | Refused>;
  // The Volumes the reference can be put in.
  volumeChoices: (ref: R) => Promise<VolumeChoices>;
  // The citations the reference's Mark is written into that it puts at
  // the entry by hand, each with its text as plain lines: what a
  // Conversion makes Citations of their Image. None for a Mark that
  // doesn't, or a Match not yet confirmed.
  converts: (ref: R) => Array<{ id: number; text: string | null }>;
}

const NONE = Promise.resolve(null);
const NO_REFERENCE = 'There is no Church-book reference to change.';

// A dataset with no references: every Citation is what it says it is.
export const noReferences: References<never> = {
  refOf: () => null,
  markKey: () => '',
  recordOf: () => null,
  resolve: async () => await Promise.resolve({ unlinked: 'unparsed' }),
  volumeLinks: async () => await NONE,
  archiveLinks: async () => await Promise.resolve([]),
  stamp: async () => await Promise.resolve(''),
  mark: async () => await Promise.resolve({ rejected: NO_REFERENCE }),
  discard: async () => await Promise.resolve({ rejected: NO_REFERENCE }),
  volumeChoices: async () => await Promise.resolve({ fits: [], others: [] }),
  converts: () => []
};
