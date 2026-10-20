export type Scope = 'person' | 'family';

// A face rectangle marked in the source photo, in the original image's pixel
// space. Used to crop the avatar to the marked area instead of the whole image.
export interface PhotoCrop {
  top: number;
  left: number;
  width: number;
  height: number;
}

// API row shapes returned by /api/persons and /api/families.
export interface PersonRow {
  id: number;
  given: string | null;
  surname: string | null;
  sex: string | null;
  birth_year: number | null;
  death_year: number | null;
  // BIRT and DEAT dates as recorded, e.g. "BET 1867 AND 1879".
  birth_date: string | null;
  death_date: string | null;
  photo_path: string | null;
  crop: PhotoCrop | null;
}

export interface FamilyRow {
  id: number;
  husband_id: number | null;
  wife_id: number | null;
  child_ids: number[];
}

// Returned by /datasets and produced by DatasetRegistry.list().
export interface DatasetInfo {
  slug: string;
  displayName: string;
  personCount: number;
  familyCount: number;
  importedAt: string | null;
}

// Returned by /api/persons/:id — what the person panel shows.
export interface PersonDetails {
  id: number;
  name: string | null;
  sex: string | null;
  facts: FactRow[];
  citations: CitationRow[];
}

// A person's own fact, or a fact of a marriage they're in (with the spouse).
export interface FactRow {
  tag: string;
  date: string | null;
  place: string | null;
  // ADDR, for events recorded with an address rather than a place.
  address: string | null;
  value: string | null;
  spouse: string | null;
}

export interface CitationRow {
  id: number;
  // Title of the cited source record, e.g. a MyHeritage collection.
  source: string | null;
  // A Church-book reference in brief, which names the source better than
  // its collection: "Haukivuori · Pää- ja rippikirjat 1821–1837 · p. 2".
  reference: string | null;
  // Where in its Volume a Church-book reference points: its page, "p. 135",
  // or failing one the date of its entry, "3.3.1761".
  entry: string | null;
  // PAGE as recorded; `url` repeats it when it is a link.
  page: string | null;
  url: string | null;
  // A MyHeritage record citation read into its fields; null for others,
  // which show `text` as recorded.
  record: RecordView | null;
  text: string | null;
  // Cites a Finnish church book, so it may get a Link.
  churchBook: boolean;
  // The church-book page cited, which a Mark places.
  citedPage: number | null;
}

export interface RecordView {
  // Whom (or which couple) the record is about.
  name: string;
  fields: RecordField[];
  household: HouseholdMember[];
}

export interface RecordField {
  label: string;
  value: string;
}

export interface HouseholdMember {
  relation: string | null;
  name: string;
  born: string | null;
}

// How far down a Link points: the entry on its Image (with its Box), the
// Image, or only the Volume.
export type Precision = 'entry' | 'image' | 'volume';

// Who says where a Link points: a person (a Mark), the vision model (a
// suggestion), or a count.
export type Certainty = 'marked' | 'vision' | 'estimated';

// What an estimate is counted from: the Volume's Page pins, or the Book's
// usual numbering.
export type EstimateBasis = 'pins' | 'numbering';

// Who saved a pin: by hand, or the vision model.
export type Provenance = 'hand' | 'vision';

// Where an entry is on an Image, in fractions of its width and height, so
// it holds at any size the scan is shown.
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Where a Church-book reference points in Astia, and who says so. A Box is
// there exactly when the Link points at the entry; one pointing only at the
// Volume has no Image, and its `url` opens the Volume's first. A Split
// reference has one per candidate Volume.
export type Link = {
  volumeId: string;
  volume: string;
  url: string;
  // The archive the Volume is in, by its title in Astia: "Pieksämäen
  // seurakunnan arkisto". Unset when Astia can't say.
  archive?: string;
} & LinkTarget;

// How far down a Link points, and who says so: the pairs that occur.
export type LinkTarget =
  | {
      precision: 'entry';
      image: number;
      box: Box;
      certainty: 'marked' | 'vision';
    }
  | {
      precision: 'image';
      image: number;
      certainty: 'marked' | 'estimated';
      // Set on an estimate: what it's counted from.
      from?: EstimateBasis;
    }
  | { precision: 'volume'; certainty: 'marked' | 'estimated' };

// Why a Church-book reference has no Link. Most are facts about the books;
// `astia-error` passes.
export type Unlinked =
  // The reference can't be read as parish, book and years.
  | 'unparsed'
  // The parish's archive in Astia isn't known.
  | 'no-archive'
  // No Volume fits the years.
  | 'no-volume'
  | 'not-digitized'
  | 'no-images'
  // A request to Astia failed.
  | 'astia-error';

export type LinkResolution = { links: Link[] } | { unlinked: Unlinked };

// A line of /api/persons/:id/scans, streamed as each citation resolves.
export type CitationLinks = { citationId: number } & LinkResolution;

// The kind of church book: rippikirja (communion book), lastenkirja
// (children's book), baptisms or marriages.
export type BookKind = 'rippi' | 'lasten' | 'kastetut' | 'vihityt';

export interface Years {
  from: number;
  to: number;
}

// A Volume a Church-book reference can be put in, by its Astia label.
export interface VolumeChoice {
  id: string;
  label: string;
  years: Years | null;
}

// GET /api/citations/:id/volumes: the parish's Volumes of the Book a
// reference cites, those its years or Record range give first, then the
// others by years.
export interface VolumeChoices {
  fits: VolumeChoice[];
  others: VolumeChoice[];
}

// A row of /api/volumes/:id/citations: one person's church-book citation
// that resolves into the Volume.
export interface VolumeCitation {
  personId: number;
  citation: CitationRow;
  // The citation's Link into this Volume, as the person panel resolves it.
  link: Link;
}

// GET /settings/scan-cache: how much space Astia's Images may take (`cap`)
// and take now (`used`), in bytes, and the caps to choose from.
export interface ScanCacheStatus {
  cap: number;
  used: number;
  caps: number[];
}
