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

// Returned by /api/persons/:id — what the Focus panel shows.
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
  // its collection: "Haukivuori · Communion book 1821–1837 · p. 2".
  reference: string | null;
  // PAGE as recorded; `url` repeats it when it is a link.
  page: string | null;
  url: string | null;
  // A MyHeritage record citation read into its fields; null for others,
  // which show `text` as recorded.
  record: RecordView | null;
  text: string | null;
  // Cites a Finnish church book, so a scan may be found for it.
  churchBook: boolean;
  // The church-book page cited, which a scan correction places.
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

// How a scan's image was found: from page numbers read off the volume
// (anchored), guessed from the book type (estimated), by hand for this
// record (placed), or not at all — the link opens the volume.
export type ScanMethod = 'anchored' | 'estimated' | 'placed' | 'volume';

// One Astia image a citation may be on; a volume split in parts can give
// one per part.
export interface Scan {
  volumeId: string;
  volume: string;
  image: number;
  url: string;
  method: ScanMethod;
}

export type ScanResolution = { scans: Scan[] } | { error: string };

// A line of /api/persons/:id/scans, streamed as each citation resolves.
export type CitationScans = { citationId: number } & ScanResolution;

// The kind of church book: rippikirja (communion book), lastenkirja
// (children's book), baptisms or marriages.
export type BookKind = 'rippi' | 'lasten' | 'kastetut' | 'vihityt';

export interface Years {
  from: number;
  to: number;
}

// A line of /api/citations/:id/volumes: a digitized Volume of the
// reference's parish. `image` is the reference's Image in it when the
// reference links it by the Book it cites, null otherwise.
export interface CitationVolume {
  id: string;
  label: string;
  kind: BookKind | null;
  years: Years | null;
  image: number | null;
}
