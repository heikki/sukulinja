// The Church-book references a source program's citations make, as the
// rest of the Citations reach them (ADR-0016). citations.ts knows two kinds
// of Citation: a Citation of an Image, whose Link is stored on it, and a
// reference, which a References port reads and resolves. Today's one port
// is MyHeritage's (myheritage/), kept as a way in (ADR-0030); noReferences
// stands in where there is none. A Volume's Page pins aren't about
// references, and are read beside the port, not through it.

import type { BoxAt, MarkTarget } from '@/common/operations';
import type {
  Link,
  LinkResolution,
  RecordView,
  VolumeChoices
} from '@/common/types';

import type { Annotation } from './annotations';
import type { Reader } from './myheritage';
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

export type { BoxAt, MarkTarget };

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
// which only undoes the Vision Match that saved it.
export interface DiscardDone {
  volume: string;
  match: boolean;
}

// A citation row as a port reads it: the page its reference is read from
// (its original page, or its page), its text, its role as imported (a
// port may read the source's record from it) and its Annotation.
export interface ReferenceRow {
  page: string | null;
  text: string | null;
  role: string | null;
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
  // Looks for every reference of `refs` on the Image `at` at once, saving
  // the Matches it confirms (ADR-0029): each one's Links as they then
  // resolve, and why it saved none, in their order.
  findAllOnImage: (
    refs: R[],
    at: BoxAt,
    reader: Reader
  ) => Promise<Array<{ resolution: LinkResolution; missed: string | null }>>;
  // The citations the reference's Mark is written into that it puts at
  // the entry by hand, each with its text as plain lines: what a
  // Conversion makes Citations of their Image. None for a Mark that
  // doesn't, or a Match not yet confirmed.
  converts: (ref: R) => Converting[];
}

// A citation a Conversion makes a Citation of its Image: its text as plain
// lines, and the person's Role in the entry, where the reference says it.
export interface Converting {
  id: number;
  text: string | null;
  role: string | null;
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
  findAllOnImage: async () => await Promise.resolve([]),
  converts: () => []
};
