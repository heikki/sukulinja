import type { AssistantChoice } from './assistant-choices';
import type { EntryEvent, EntryFields } from './entry-events';

// A face rectangle marked in the source photo, in the original image's pixel
// space. Used to crop the avatar to the marked area instead of the whole image.
export interface PhotoCrop {
  top: number;
  left: number;
  width: number;
  height: number;
}

// The rows the `persons` and `families` operations answer.
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
  // Built by an older version of the app than migrations reach, or by a
  // newer one, so it won't open (ADR-0018); null when it opens. An older
  // one can only be deleted; a newer one opens again in that version.
  outdated: 'older' | 'newer' | null;
}

// What an import says as it goes, one event per line: its steps, then
// whether it was saved.
export type ImportEvent =
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; info: DatasetInfo };

// Where a dataset's GEDZIP was saved.
export interface ExportSaved {
  path: string;
}

// What the `person` operation answers: what the person panel shows.
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
  // GEDCOM's ADDR: a mailing address (ADR-0023).
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
  // A mailing address (GEDCOM's ADDR, ADR-0023).
  address: string;
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

// Who's put in place as someone's relative: a new person, by their name,
// empty for none, and sex; or someone already in the tree.
export type RelativeWho = PersonName | { personId: number };

// A person's name, given names and surname, empty for none, and sex, as
// typed.
export interface PersonName {
  given: string;
  surname: string;
  sex: Sex;
}

// A relative put in place for someone. A child goes into `familyId`, one
// of the person's families as a spouse, when they have more than one; null
// otherwise, or 'new' for a new family of only the person.
export interface NewRelative {
  relation: Relation;
  who: RelativeWho;
  familyId: number | null | 'new';
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
  // PAGE as recorded.
  page: string | null;
  // A MyHeritage record citation read into its fields; null for others,
  // which show `text` as recorded.
  record: RecordView | null;
  text: string | null;
  // Cites a Finnish church book, so it may get a Link.
  churchBook: boolean;
  // Made in the app, on an Astia Image: it has no Church-book reference,
  // and its Link is the Mark it was made with.
  madeInApp: boolean;
  // Citations with the same markKey share one Mark and its Box: those of
  // one record. A Citation with no Church-book reference has its own.
  markKey: string;
  // The church-book page cited, which a Mark places.
  citedPage: number | null;
  // What a Church-book reference cites, as far as it can be read; null for
  // other sources.
  cited: CitedBook | null;
  // The Facts it supports, by id: its person's and their marriages'
  // (ADR-0022).
  supports: number[];
  // The Entry it cites, which everyone in the entry cites (ADR-0026);
  // null for one that cites none.
  entryId: number | null;
  // The Event that Entry records (ADR-0033); null when it isn't known,
  // and with no Entry.
  event: EntryEvent | null;
  // What that Entry says, its dates and place (ADR-0033); null with no
  // Entry.
  fields: EntryFields | null;
  // Who its person is in that Entry, one of its Event's Roles; null for
  // none, and with no Entry.
  role: string | null;
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

// A line of the `personLinks` operation, streamed as each citation
// resolves.
export type CitationLinks = { citationId: number } & LinkResolution;

// What a Vision Match of one reference did (ADR-0029): its Links as they
// then resolve, and null when it saved a Match, else why it didn't.
export interface VisionTry {
  links: CitationLinks;
  missed: string | null;
}

// Every estimate on an Image looked for in one question (ADR-0029): each
// one's try; the questions it asked the model, how many of them earlier
// readings answered for nothing, what the rest cost, and how long it took.
// A page survey of a Volume (ADR-0032): how many Page pins it saved,
// whether its readings all agree, and what it took.
export interface VisionSurvey extends VisionTook {
  pinned: number;
  settled: boolean;
}

export interface VisionPageTry extends VisionTook {
  tries: VisionTry[];
}

// What asking the vision model took: the model, the questions it asked,
// how many of them earlier readings answered for nothing, what the rest
// cost, and how long it took.
export interface VisionTook {
  model: string;
  readings: number;
  cached: number;
  dollars: number | null;
  seconds: number;
}

// A line of the `locateVolume` operation (ADR-0032), as it goes: its page
// survey, where none of the Volume's pages are known, then the estimates
// looked for Image by Image, each Image's tries, and last what it all
// took, or why it stopped.
export type VolumeLocating =
  | { surveying: true }
  | { surveyed: VisionSurvey }
  | { searching: { nth: number; images: number; estimates: number } }
  | { tried: VisionTry[] }
  | { done: VisionTook | null }
  | { refused: string; took: VisionTook | null };

// The kind of church book: rippikirja (communion book), lastenkirja
// (children's book), baptisms or marriages.
export type BookKind = 'rippi' | 'lasten' | 'kastetut' | 'vihityt' | 'haudatut';

export interface Years {
  from: number;
  to: number;
}

// What in a person's life an Expected entry is of: their baptism, their
// childhood in the lastenkirjat, their life in the rippikirjat, a marriage
// or their burial.
export type LifeStage = 'birth' | 'childhood' | 'life' | 'marriage' | 'death';

// An Entry a person's Facts say a kind of Book should hold of them, in
// some years, in the parishes their places name.
export interface ExpectedEntry {
  kind: BookKind;
  of: LifeStage;
  years: Years;
  // Its years aren't all a Fact's own: a life with no death runs to the
  // last year a Fact gives.
  estimated: boolean;
  // The places of the Facts it's from, as written, its own Fact's first.
  places: string[];
}

// A parish an Expected entry is looked for in: its archive, and its name
// as the parishes first spell it ("Pieksämäki"), else the archive's title.
export interface LookedParish extends ChurchBookArchive {
  parish: string;
}

// A Volume an Expected entry may be in, with the archive holding it and
// its parish's name.
export interface SuggestedVolume {
  id: string;
  label: string;
  years: Years | null;
  archiveId: string;
  archive: string;
  parish: string;
  // In a parish its own Facts' places name, rather than one of the
  // person's other places or sources.
  near: boolean;
}

// The `personBooks` operation: one of a person's Expected entries, the
// parishes it was looked for in, and the Volumes it fits, nearest first,
// then by years. None where no Volume covers its years, or no parish is
// known for the person's places.
export interface BookSuggestion {
  expected: ExpectedEntry;
  parishes: LookedParish[];
  volumes: SuggestedVolume[];
}

// A Volume a Church-book reference can be put in, by its Astia label.
export interface VolumeChoice {
  id: string;
  label: string;
  years: Years | null;
}

// The `volumeChoices` operation: the parish's Volumes of the Book a
// reference cites, those its years or Record range give first, then the
// others by years.
// The page numbers on an Image of a Volume, as its estimates count them
// from its Page pins (ADR-0032): `by` whom they were read on that very
// Image, null where counted from the pins around it.
export interface ImagePages {
  image: number;
  pages: number[];
  by: Provenance | null;
}

export interface VolumeChoices {
  fits: VolumeChoice[];
  others: VolumeChoice[];
}

// The `volume` operation: what Astia says of a Volume, which
// doesn't change as the app is used, in one answer: its viewer URL for
// each Image, in order, and the title of the dataset's archive holding it,
// null when none does or Astia can't say. The people citing it, which
// can, are asked for apart (`volumeCitations`).
export interface VolumeContents {
  images: string[];
  archive: string | null;
}

// A row of the `volumeCitations` operation: one person's church-book citation
// that resolves into the Volume.
export interface VolumeCitation {
  personId: number;
  citation: CitationRow;
  // The citation's Link into this Volume, as the person panel resolves it.
  link: Link;
}

// The `scanCache` operation: how much space Astia's Images may take (`cap`)
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

// The `downloads` operation: each download this run.
export interface DownloadStatus {
  volumeId: string;
  state: DownloadState;
  error: DownloadError | null;
}

// The `archives` operation: an archive the dataset's church books are
// in, by its title in Astia ("Juvan seurakunnan arkisto"), as a Link's
// `archive` names it; its id when Astia can't say.
export interface ChurchBookArchive {
  archiveId: string;
  title: string;
}

// The `churchBooks` operation: one of a parish's Volumes in Astia's
// order, what of it is on disk, and its download if it has one.
export interface ChurchBookVolume {
  id: string;
  label: string;
  // The kind of Book and the years its label gives, null where it doesn't.
  kind: BookKind | null;
  years: Years | null;
  digitized: boolean;
  onDisk: VolumeOnDisk;
  download: DownloadStatus | null;
}

// The `bookList` operation: a Volume on the dataset's Book list, with the
// archive holding it, by its id and title, how many of the dataset's
// Citations link into it, and whether it was added to the list by hand.
// One no Citation links into is on it only as added, and can be taken off.
export interface ListedBook extends ChurchBookVolume {
  archiveId: string;
  archive: string;
  cited: number;
  added: boolean;
}

// The `allBooks` operation: a Volume with something on this computer, in
// the Scan cache or downloading, whatever dataset it's of; with the
// archive holding it, by its id and title, when one of the install's
// parishes has it, null when none does.
export interface InstalledBook extends ChurchBookVolume {
  archiveId: string | null;
  archive: string | null;
  pages: PageNumbering;
  // What it offloaded, its full-size Images and their bytes, when it's
  // offloaded: only its cited Images kept, no other fetched; else null.
  offloaded: { images: number; bytes: number } | null;
  // The bytes offloading it would free; null when it's offloaded, or
  // when that isn't known.
  offloadFrees: number | null;
}

// The offload folder set for the install, and whether its drive is
// attached.
export interface OffloadFolder {
  path: string;
  attached: boolean;
}

// What's known of a Volume's page numbers: none read or set (`counted` as
// its book is numbered), some read or set, or all marked checked by hand.
export type PageNumbering = 'counted' | 'read' | 'checked';

// A pin made on a filming of its Volume that Astia has since replaced,
// which switching to the new filming leaves out: saved in the data folder
// or a dataset's Marks, on the Image it gives. A Page pin gives its
// pages, a Record pin its record, a Reference pin the URL of its
// reference.
export interface StalePin {
  kind: 'page' | 'record' | 'reference';
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
// Match there; `moved` for a Citation of an Image moved to another entry,
// as written before an Entry's Box moved as a `move`;
// `pagePin` the cited page it pinned); a Discard; a Citation made in the
// Scan viewer, or deleted (with what it cited); an import, which made the
// dataset; or a Volume switched to Astia's new filming, with the Image counts and how many pins it left out.
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
  | { kind: 'discard'; volume: string; image: number }
  | { kind: 'cite'; volume: string; image: number }
  | { kind: 'uncite'; cited: string | null }
  // What an Entry says changed, by where it's written, as it reads now.
  | { kind: 'transcribe'; volume: string; image: number; text: string | null }
  // An Entry's Box moved, by where it's written now.
  | { kind: 'move'; volume: string; image: number }
  // A person's Role in an Entry changed, from and to: GEDCOM's citation
  // ROLE, null for none.
  | {
      kind: 'role';
      volume: string;
      image: number;
      from: string | null;
      to: string | null;
    }
  // The Event an Entry records changed, from and to, null for none.
  | {
      kind: 'event';
      volume: string;
      image: number;
      from: EntryEvent | null;
      to: EntryEvent;
    }
  // What a Citation of no Entry says changed, by what it cites, as it
  // reads now.
  | { kind: 'retext'; cited: string | null; text: string | null }
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
  // A Citation made, or no longer, to support a Fact of its person's, by
  // the Fact's tag and words as they read then (factWords).
  | {
      kind: 'support';
      did: 'add' | 'remove';
      tag: string;
      fact: string | null;
    }
  // A person added to the tree, or someone already in it linked, as the
  // relation of the person named, as they were named then; or taken out
  // of a family as a child, or as a parent ('spouse'), of those named, if
  // anyone; or moved to another family, as a child or a parent, of those
  // named there.
  | {
      kind: 'person';
      did: 'add' | 'link' | 'unlink' | 'move';
      relation: Relation;
      of: string;
    }
  // A person's name and sex changed, as they read before and after:
  // "Matti Virtanen, male".
  | { kind: 'person'; did: 'edit'; was: string; now: string }
  // A person deleted; the Change's `who` names them as they were.
  | { kind: 'person'; did: 'delete' }
  | { kind: 'import'; file: string }
  // A dataset started with its first person, whom it's on.
  | { kind: 'new-dataset' }
  // The Facts whose address stood alone, as MyHeritage wrote residences,
  // given it as their place, by a script since removed (ADR-0023).
  | { kind: 'addresses-to-places'; facts: number }
  // The Facts whose place was written another way, as in Finland without
  // Suomi or with its province, by a script since removed (ADR-0024).
  | { kind: 'places-tidied'; facts: number }
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

// Something done in the app that changed the dataset, when (ISO 8601).
// `on` is null when it was on nothing, or what it was on is gone; `who`
// names the person it was on as they were named then; `via` says it was
// made through the assistant, null by hand.
export interface Change {
  id: number;
  at: string;
  what: ChangeWhat;
  on: ChangeOn | null;
  who: string | null;
  via: ChangeVia | null;
}

// How a Change was made other than by hand: through the assistant, by a
// Proposal applied.
export type ChangeVia = 'assistant';

// A change to a Reminder: its text, or whether it's done.
export interface ReminderChange {
  text?: string;
  done?: boolean;
}

// Where the assistant's Anthropic credentials come from: a key kept in the
// system's credential store, the environment, or nowhere yet.
export interface AssistantKeyStatus {
  source: 'saved' | 'environment' | null;
}

// What requests to Claude spent: how many, their tokens, and dollars (null
// when the model's price isn't known).
export interface Spend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  dollars: number | null;
}

// Why an assistant's turn ended: answered, declined, cut short by length,
// or by asking more than a turn may.
export type AssistantTurnEnd =
  'answered' | 'declined' | 'too-long' | 'too-many-steps';

// What the assistant tells of a turn as it runs: the conversation it's in,
// each piece of its answer as written, what it's reading, what it
// proposes or takes back, where it moves the view, and how it ended, with
// what the conversation has spent so far; or why it failed.
export type AssistantEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text'; text: string }
  | { type: 'reading'; label: string }
  | { type: 'proposed'; item: ProposalItem }
  | { type: 'withdrawn'; id: number }
  | { type: 'shown'; on: ShowOn; label: string }
  | { type: 'done'; spend: Spend; ended: AssistantTurnEnd }
  | { type: 'error'; message: string };

// Where the assistant moves the view: a person selected, or one of their
// Citations opened in the Scan viewer.
export type ShowOn = Extract<On, { kind: 'person' | 'citation' }>;

// One change the assistant proposes, for the person to tick and apply:
// what it would do, in words, and why; or a batch of changes, with a few
// of them named. Its id is its place in the conversation's Proposal, from
// 1.
export interface ProposalItem {
  id: number;
  label: string;
  reason: string;
  // A batch's first few changes, in words; none for one change.
  examples: string[];
}

// What applying the ticked items did: each one done, or refused with why;
// and the copy of the dataset taken first, for a large Proposal.
export interface Applied {
  outcomes: Array<{ id: number; refused: string | null }>;
  backup: string | null;
}

// A question to the assistant: in the conversation by id, or a new one
// for null; with the person on screen, or null, and everyone the chart
// draws; answered as chosen in Settings.
export interface AssistantQuestion extends AssistantChoice {
  conversation: string | null;
  text: string;
  personId: number | null;
  onChart: number[];
}
