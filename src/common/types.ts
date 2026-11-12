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
  // A death, burial or cremation is recorded, dated or not ("DEAT Y").
  died: boolean;
  photo_path: string | null;
  crop: PhotoCrop | null;
}

export interface FamilyRow {
  id: number;
  husband_id: number | null;
  wife_id: number | null;
  child_ids: number[];
}

// A dataset as the registry lists it.
export interface DatasetInfo {
  slug: string;
  displayName: string;
  personCount: number;
  familyCount: number;
  importedAt: string | null;
  // The file it was last imported from.
  sourceFilename: string | null;
  // Built by an older version of the app, so it won't open until it's
  // imported again (ADR-0013).
  outdated: boolean;
  // The database from before the last import is kept, to go back to.
  undoable: boolean;
}

// What importing into an existing dataset would change, shown before it's
// saved (ADR-0013): what the export added and no longer has, what's kept
// from the app, and what can't be kept, its person or record gone.
export interface ImportReview {
  people: { added: number; gone: number };
  citations: { added: number; gone: number };
  kept: {
    marks: number;
    // Citations made in the app, attached again to their person.
    citations: number;
    // Citations made in the app that the export now has too: the export's
    // is kept, with the link.
    duplicates: number;
    // Citations converted from a reference (ADR-0016), which the export
    // still has as the reference: the export's is left out.
    converted: number;
    rejections: number;
    // Reminders, put back where they were, or a Citation's onto its person.
    reminders: number;
    // Tags, put back on their person in the same Photo (ADR-0017).
    tags: number;
  };
  // Each Mark, citation made in the app, Reminder or Tag that can't be
  // kept, described.
  lost: string[];
  // Why the dataset's database couldn't be read, so nothing is kept from
  // it; null when it was.
  unreadable: string | null;
}

// What an import says as it goes, one event per line: its steps, then
// whether it was saved. One into an existing dataset first asks for its
// review, which is answered by its id.
export type ImportEvent =
  | { type: 'log'; message: string }
  | { type: 'review'; id: string; review: ImportReview }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }
  | { type: 'done'; info: DatasetInfo };

// The two exports: the dataset's GEDZIP, and a GEDCOM 5.5.1 file for
// MyHeritage with what it leaves out.
export type ExportKind = 'gdz' | 'myheritage';

// Where an export was saved, and what it left out.
export interface ExportSaved {
  path: string;
  left: string[];
}

// Returned by /api/persons/:id — what the person panel shows.
export interface PersonDetails {
  id: number;
  name: string | null;
  sex: string | null;
  facts: FactRow[];
  // The families they're a spouse in, with the spouse named: where a
  // marriage's Facts go.
  marriages: Marriage[];
  citations: CitationRow[];
  photos: PhotoRow[];
}

export interface Marriage {
  familyId: number;
  spouse: string | null;
}

// A Photo of the person's: one picture in the dataset, by its stored path,
// and the people it's linked to, in the order linked. A person's Box is
// where their Tag puts them on it (ADR-0020); null when they're linked
// with none.
export interface PhotoRow {
  id: number;
  path: string;
  people: PhotoPerson[];
}

export interface PhotoPerson {
  personId: number;
  box: Box | null;
}

// A picture added from disk: the Photo, and whether the dataset had it
// already, the same file added before.
export interface AddedPhoto {
  photo: PhotoRow;
  already: boolean;
}

// A person's own fact, or a fact of a marriage they're in (with the spouse).
export interface FactRow {
  id: number;
  // The family whose fact it is, for a marriage's; null for the person's own.
  familyId: number | null;
  tag: string;
  // An EVEN's or FACT's kind, in words ("Muutto").
  type: string | null;
  // As stored, a GEDCOM date.
  date: string | null;
  place: string | null;
  // ADDR, for events recorded with an address rather than a place.
  address: string | null;
  value: string | null;
  spouse: string | null;
}

// What a Fact says, as typed in the panel: its date the Finnish way
// (typedDate), its place, an attribute's value and an Event's type. Empty
// for none.
export interface FactFields {
  date: string;
  place: string;
  value: string;
  type: string;
}

// A Fact to add to a person, of a kind the app offers (ADDABLE_FACTS); a
// family's, a marriage's, to one of their families.
export interface NewFact extends FactFields {
  tag: string;
  familyId: number | null;
}

// How a new person is related to the one they're added for.
export type Relation = 'father' | 'mother' | 'spouse' | 'child' | 'sibling';

// A person's sex as GEDCOM 7 has it: male, female, other, unknown.
export type Sex = 'M' | 'F' | 'X' | 'U';

// A person added to the tree as someone's relative: their name, empty for
// none, and sex. A child goes into `familyId`, one of the person's families
// as a spouse, when they have more than one; null otherwise.
export interface NewRelative {
  relation: Relation;
  given: string;
  surname: string;
  sex: Sex;
  familyId: number | null;
}

export interface CitationRow {
  id: number;
  // Title of the cited source record, e.g. a MyHeritage collection.
  source: string | null;
  // A Church-book reference in brief, which names the source better than
  // its collection: "Haukivuori · Pää- ja rippikirjat 1821–1837 · p. 2".
  reference: string | null;
  // Where in its Volume a Church-book reference points: its page, "p. 135",
  // or failing one the date of its entry, "3.3.1761". A Citation of an
  // Astia Image gives the Image, "Image 13".
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
  // Made in the app, on an Astia Image: it has no Church-book reference,
  // and its Link is the Mark it was made with.
  madeInApp: boolean;
  // Whether it can be deleted: made in the app, not converted from a
  // reference (ADR-0016).
  deletable: boolean;
  // Citations with the same markKey share one Mark and its Box: those of
  // one record. A Citation with no Church-book reference has its own.
  markKey: string;
  // The church-book page cited, which a Mark places.
  citedPage: number | null;
  // What a Church-book reference cites, as far as it can be read; null for
  // other sources.
  cited: CitedBook | null;
}

// The parish, kind of Book and years a Church-book reference cites.
export interface CitedBook {
  parish: string | null;
  kind: BookKind | null;
  years: Years | null;
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

// Who says where a Link points: a person (a Mark), the vision model (a
// suggestion), or a count.
export type Certainty = 'marked' | 'match' | 'estimated';

// What an estimate is counted from: the Volume's Page pins, or the Book's
// usual numbering.
export type EstimateBasis = 'pins' | 'numbering';

// Who saved a pin: by hand, or the vision model.
export type Provenance = 'hand' | 'vision';

// Where an entry is on an Image, in whole pixels of the full-size Image, as
// GEDCOM's CROP holds it (ADR-0013). The Scan viewer has the Image open to
// scale it by; a vision reading gives fractions, scaled the same way.
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
      certainty: 'marked' | 'match';
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

// No Link, and why. `archive` names the parish's archive, as a Link's does,
// when the parish's books were looked through: its Volumes can be browsed
// for the entry.
export interface UnlinkedResolution {
  unlinked: Unlinked;
  archive?: string;
}

export type LinkResolution = { links: Link[] } | UnlinkedResolution;

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

// GET /d/<slug>/api/volumes/:id: what Astia says of a Volume, which
// doesn't change as the app is used, in one answer: its viewer URL for
// each Image, in order, and the title of the dataset's archive holding it,
// null when none does or Astia can't say. The people citing it, which
// can, are asked for apart (/citations).
export interface VolumeContents {
  images: string[];
  archive: string | null;
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

// What of a Volume the Scan cache has on disk: its full-size Images of
// Astia's list (`images`, null until the list has been asked for), and
// the space its files take, in bytes.
export interface VolumeOnDisk {
  images: number | null;
  cached: number;
  bytes: number;
}

// A Volume's download this run: waiting its turn, on its way, or stopped
// short, by hand or by why: Astia couldn't be reached, kept giving no image
// for a file it still lists, or re-scanned the Volume under it. One that
// finished is no longer listed; what's on disk says the rest.
export type DownloadState = 'queued' | 'downloading' | 'stopped';
export type DownloadError = 'unreachable' | 'no-image' | 'rescanned';

// GET /astia/downloads: each download this run.
export interface DownloadStatus {
  volumeId: string;
  state: DownloadState;
  error: DownloadError | null;
}

// GET /d/<slug>/api/archives: an archive the dataset's church books are
// in, by its title in Astia ("Juvan seurakunnan arkisto"), as a Link's
// `archive` names it; its id when Astia can't say.
export interface ChurchBookArchive {
  archiveId: string;
  title: string;
}

// GET /astia/archives/<id>/volumes: one of a parish's Volumes in Astia's
// order, what of it is on disk, and its download if it has one.
export interface ChurchBookVolume {
  id: string;
  label: string;
  digitized: boolean;
  onDisk: VolumeOnDisk;
  download: DownloadStatus | null;
}

// A pin made on a filming of its Volume that Astia has since replaced,
// which switching to the new filming leaves out: shipped with the app or
// saved in the data folder, on the Image it gives. A Page pin gives its
// pages, a Record pin its record, a Reference pin or Rejection the URL of
// its reference.
export interface StalePin {
  kind: 'page' | 'record' | 'reference' | 'rejection';
  from: 'shipped' | 'local';
  by: Provenance;
  image: number;
  pages?: number[];
  record?: number;
  url?: string;
  // A Record or Reference pin's: the markKey of the Citations it pins.
  markKey?: string;
}

// GET /astia/volumes/:id/rescan: Astia's re-scan of the Volume not yet
// switched to, with the Image counts of the filming shown and the new one;
// `rescan` is null when the Volume's list is as cached.
export interface Rescan {
  cached: number;
  images: number;
  stale: StalePin[];
}

// What something the app keeps beside the tree is on, such as a Reminder,
// described: a person, one of their Citations (by its source and where it
// points), or an Image of a Volume, by the file it had when it was put
// there. `stale` when the Volume's filming has changed since.
export type On =
  | { kind: 'person'; personId: number }
  | {
      kind: 'citation';
      personId: number;
      citationId: number;
      source: string | null;
      reference: string | null;
    }
  | {
      kind: 'image';
      volumeId: string;
      volume: string;
      image: number;
      fileId: string;
      stale: boolean;
      // Whom it's about too, if anyone: it was written with them selected.
      personId: number | null;
    };

// Something to come back to, written in the app. `done` is when it was
// marked done, null while it's open; both times are ISO 8601.
export interface Reminder {
  id: number;
  text: string;
  on: ReminderOn;
  created: string;
  done: string | null;
}

// What a Reminder is on: a person, or an Image, maybe about a person too.
export type ReminderOn = Exclude<On, { kind: 'citation' }>;

// What a new Reminder is put on.
export type ReminderTarget = Exclude<OnTarget, { citationId: number }>;

// What a new one is put on.
export type OnTarget =
  | { personId: number }
  | { citationId: number }
  | {
      volumeId: string;
      volume: string;
      image: number;
      fileId: string;
      personId?: number;
    };

// What a Change did, as it was said when it was done: a Mark, at the
// entry, the Image or only the Volume (`confirmed` when it confirmed a
// Match there; `moved` for a Citation of an Image moved to another entry;
// `pagePin` the cited page it pinned); a Discard (`rejection` when it took
// back a Match); a Citation made in the Scan viewer, or deleted (with what
// it cited); an import (`merged` into the dataset there, with how much it
// couldn't keep), or its undoing; or a Volume switched to Astia's new
// filming, with the Image counts and how many pins it left out.
export type ChangeWhat =
  | {
      kind: 'mark';
      at: 'entry' | 'image' | 'volume';
      volume: string;
      image: number | null;
      confirmed: boolean;
      moved: boolean;
      citations: number;
      pagePin: number | null;
    }
  | { kind: 'discard'; volume: string; image: number; rejection: boolean }
  | { kind: 'cite'; volume: string; image: number }
  | { kind: 'uncite'; cited: string | null }
  // A Tag made, its Box moved, or taken back, in the Photo named.
  | { kind: 'tag'; photo: string; moved: boolean }
  | { kind: 'untag'; photo: string }
  // The Photo named chosen as the person's portrait.
  | { kind: 'portrait'; photo: string }
  // A Photo added from disk, or deleted with how many people were on it,
  // by its file name.
  | { kind: 'photo'; did: 'add'; photo: string }
  | { kind: 'photo'; did: 'delete'; photo: string; people: number }
  // A Fact added, changed or deleted, by its tag, as it read before and
  // after (factWords), null for none.
  | {
      kind: 'fact';
      did: 'add' | 'edit' | 'delete';
      tag: string;
      was: string | null;
      now: string | null;
    }
  // A person added as the relation of the person named, as they were
  // named then.
  | { kind: 'person'; did: 'add'; relation: Relation; of: string }
  | { kind: 'import'; file: string; merged: boolean; lost: number }
  | { kind: 'undo-import' }
  | {
      kind: 'switch-filming';
      volume: string;
      from: number;
      to: number;
      stale: number;
    };

// What a Change is on: what a Reminder can be, a Citation, or a Photo,
// with the person tagged or untagged in it.
export type ChangeOn =
  On | { kind: 'photo'; personId: number; photoId: number };

// What a new Change is put on.
export type ChangeTarget = OnTarget | { personId: number; photoId: number };

// A Change as it's written: what it did, and what it was on, if anything.
export interface NewChange {
  on: ChangeTarget | null;
  what: ChangeWhat;
}

// Something done in the app that changed the dataset, when (ISO 8601).
// `on` is null when it was on nothing, or what it was on is gone; `who`
// names the person it was on as they were named then.
export interface Change {
  id: number;
  at: string;
  what: ChangeWhat;
  on: ChangeOn | null;
  who: string | null;
}

// A change to a Reminder: its text, or whether it's done.
export interface ReminderChange {
  text?: string;
  done?: boolean;
}
