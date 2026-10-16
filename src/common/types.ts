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
// (anchored), guessed from the book type (estimated), exactly for this
// record (placed), or not at all — the link opens the volume.
export type ScanMethod = 'anchored' | 'estimated' | 'placed' | 'volume';

// Who saved a correction: marked by hand, or matched by the vision model.
export type Provenance = 'hand' | 'vision';

// Where an entry is on an Image, in fractions of its width and height, so
// it holds at any size the scan is shown.
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// One Astia image a citation may be on; a volume split in parts can give
// one per part.
export interface Scan {
  volumeId: string;
  volume: string;
  image: number;
  url: string;
  method: ScanMethod;
  // Set on a placed scan: whether a person or the vision model placed it.
  by?: Provenance;
  // Set on a placed scan where the vision model said where the entry is.
  box?: Box;
  // The archive the Volume is in, by its title in Astia: "Pieksämäen
  // seurakunnan arkisto". Unset when Astia can't say.
  archive?: string;
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

// A row of /api/volumes/:id/citations: one person's church-book citation
// that resolves into the Volume. `image` is null for one resolved only to
// the Volume as a whole (method `volume`); `split` marks one of several
// candidate Volumes; `box` is where the entry is, where known.
export interface VolumeCitation {
  personId: number;
  citation: CitationRow;
  // The citation's link into this Volume, as the person panel resolves it.
  scan: Scan;
  split: boolean;
}

// GET /settings/scan-cache: how much space Astia's Images may take (`cap`)
// and take now (`used`), in bytes, and the caps to choose from.
export interface ScanCacheStatus {
  cap: number;
  used: number;
  caps: number[];
}
