// Church-book reference → Astia volume → image.
//
// Astia knows only image order, so a cited page is turned into an image via
// Page pins: what's written on one image, as a Mark or the vision model
// read it in the app (nothing is shipped: an estimate starts from the
// reference alone). One number means the book numbers spreads
// (`pages: [77]`); two mean it numbers pages (`pages: [40, 41]`). Where
// MyHeritage's indexer misread the page number, a Page pin gives the number
// as cited and a `note` says what's written. Without one, a book is
// counted from its first Image: rippikirjat one number a spread,
// lastenkirjat two, and a rippikirja whose cited page wouldn't fit that way
// two as well.
//
// Which volume a reference is in comes from its book's years, then the
// villages in Astia's labels and page numbers. Where it's known, a volume
// lists the Record ranges on its film, grown from the Marks and Matches: MyHeritage numbers each film's records in one
// block, in image order, and blocks don't overlap, so a record pinned on a
// film places every record numbered around it there too. A Record pin puts
// its record on a known image; so does a Reference pin its reference.

import { pageNumbering } from '@/common/page-numbering';
import type {
  Box,
  ImagePages,
  Link,
  LinkResolution,
  LinkTarget,
  Provenance,
  Unlinked
} from '@/common/types';

import { viewerUrl } from '../../astia/astia';
import type { Astia, Volume } from '../../astia/astia';
import { bookKind } from '../../text';
import type { BookKind, Years } from '../../text';
import type { ChurchBookRef } from '../record';
import { filmingOf, leavesOut, splitVolume } from './filming';

// Pins say who saved them; a missing `by` is by hand, which covers every
// local file written before the vision model.
// A pin on an Image keeps that Image's Astia file id, which tells the
// filming it was made on: after a re-scan the Image number is another
// page, and the pin is left out (see filming.ts).
export interface PagePin {
  image: number;
  pages: number[];
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
  // The Volume's page numbers marked checked by hand: locked until
  // unmarked.
  checked?: boolean;
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

// Where a Record or Reference pin points, and who says so: as far down as it
// goes, with the entry's Box. The vision model only pins an entry, so a
// vision pin without a Box points nowhere.
function pinnedTarget(pin: {
  image?: number;
  box?: Box;
  by?: Provenance;
}): LinkTarget | null {
  const certainty = pin.by === 'vision' ? 'match' : 'marked';
  if (pin.image !== undefined && pin.box !== undefined) {
    return { precision: 'entry', image: pin.image, box: pin.box, certainty };
  }
  if (certainty !== 'marked') return null;
  return pin.image === undefined
    ? { precision: 'volume', certainty }
    : { precision: 'image', image: pin.image, certainty };
}

// ---------------------------------------------------------------- volumes

function overlap(a: Years, b: Years) {
  return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from) + 1);
}

function partsOverlap(v: Volume, years: Years) {
  return v.parts.reduce((sum, p) => sum + overlap(p, years), 0);
}

// Exact year range first (MyHeritage cites a volume's whole span), then
// volumes with a part containing the cited range, then the best partial
// overlap (MyHeritage and Astia sometimes disagree by a year). Parts leave
// out a span's gaps.
function candidateVolumes(volumes: Volume[], kind: BookKind, years: Years) {
  const sameKind = volumes.filter((v) => v.kind === kind && v.years !== null);
  const exact = sameKind.filter(
    (v) => v.years!.from === years.from && v.years!.to === years.to
  );
  if (exact.length > 0) return exact;
  const containing = sameKind.filter((v) =>
    v.parts.some((p) => p.from <= years.from && p.to >= years.to)
  );
  if (containing.length > 0) return containing;
  const best = Math.max(0, ...sameKind.map((v) => partsOverlap(v, years)));
  return best === 0
    ? []
    : sameKind.filter((v) => partsOverlap(v, years) === best);
}

// The volume whose film holds the record, whatever book the reference names.
function filmedIn(volumes: Volume[], recordId: number | null, pins: Pins) {
  if (recordId === null) return [];
  return volumes.filter((v) =>
    (pins.volumes[v.id]?.ranges ?? []).some(
      (r) => r.from <= recordId && recordId <= r.to
    )
  );
}

// Old spellings use W for V ("Wehmais", "Wäätämönsalmi").
function placeKey(s: string) {
  return s.toLowerCase().replace(/w/g, 'v').trim();
}

// "I Aa:21 Pää- ja rippikirjat, I Haapakoski - Längelmäki (1859-1868)" →
// the village range it covers. Books for the landless ("tilattomat A - Ö")
// are arranged by person, not village, so they have no range.
function villageRange(label: string) {
  if (/tilattom/i.test(label)) return null;
  const m =
    /(?<from>[A-ZÅÄÖW][\p{L}]*)\s+-\s+(?<to>[A-ZÅÄÖW][\p{L}]*)[^(]*\(\d{4}/u.exec(
      label
    )?.groups;
  return m === undefined
    ? null
    : { from: placeKey(m.from!), to: placeKey(m.to!) };
}

function inRange(place: string, range: { from: string; to: string }) {
  const key = placeKey(place);
  const head = key.slice(0, range.to.length);
  return (
    key.localeCompare(range.from, 'fi') >= 0 &&
    head.localeCompare(range.to, 'fi') <= 0
  );
}

// Among volumes split by village, keep those known to hold one of the
// reference's place names, else those whose range covers one; if none does,
// the split can't be decided here.
function narrowByVillage(volumes: Volume[], places: string[], pins: Pins) {
  if (volumes.length < 2) return volumes;
  const keys = places.map(placeKey);
  const known = volumes.filter((v) =>
    (pins.volumes[v.id]?.villages ?? []).some((name) =>
      keys.includes(placeKey(name))
    )
  );
  if (known.length > 0) return known;
  const matches = volumes.filter((v) => {
    const range = villageRange(v.label);
    return range !== null && places.some((p) => inRange(p, range));
  });
  return matches.length > 0 ? matches : volumes;
}

// ---------------------------------------------------------------- pages

// The pages the Volume's Page pins put on each of its Images, as its
// estimates count them; without pins, as its books are numbered. Of the
// Volume `volumeId`, `label` by its label.
export async function volumePages(
  astia: Astia,
  volume: { volumeId: string; label: string },
  pins: Pins
): Promise<ImagePages[]> {
  const filming = await filmingOf(astia, volume.volumeId);
  const own = splitVolume(filming, pins).current;
  return pageNumbering(
    own.pages,
    filming.files.length,
    bookKind(volume.label)
  ).pages();
}

// The Images the Volume's Record pins leave the record: after those of
// lower Record numbers, before those of higher, as MyHeritage numbers a
// film's records in Image order.
function recordBounds(records: RecordPin[], recordId: number | null) {
  if (recordId === null) return { from: 1, to: Infinity };
  const below = records.filter((r) => r.record < recordId);
  const above = records.filter((r) => r.record > recordId);
  return {
    from: Math.max(1, ...below.map((r) => r.image)),
    to: Math.min(Infinity, ...above.map((r) => r.image))
  };
}

// Where the cited page is, by the Volume's numbering: an Image, null
// past the Volume, or 'overran' when no run of its Page pins reaches it.
// Of a Volume numbering its pages over again, the run the Record pins
// leave the record in, else the one with the most pins.
function countedImage(
  pins: PagePin[],
  images: number,
  ref: ChurchBookRef,
  records: RecordPin[]
) {
  const placing = pageNumbering(pins, images, ref.kind).place(ref.page!);
  if (placing.from === 'numbering') return placing;
  const reached = placing.places;
  if (reached.length === 0) return 'overran' as const;
  const { from, to } = recordBounds(records, ref.recordId);
  const fits = reached.filter((r) => r.image >= from && r.image <= to);
  const pool = fits.length > 0 ? fits : reached;
  const best = pool.reduce((a, r) => (r.pins > a.pins ? r : a));
  return { from: 'pins' as const, image: best.image };
}

interface Located {
  volume: Volume;
  files: string[];
  target: LinkTarget;
  // Counted from the volume's Page pins, the cited page fell outside it.
  overran?: boolean;
}

const ESTIMATED_VOLUME: LinkTarget = {
  precision: 'volume',
  certainty: 'estimated'
};

async function locate(
  astia: Astia,
  v: Volume,
  ref: ChurchBookRef,
  pins: Pins
): Promise<Located> {
  const filming = await filmingOf(astia, v.id);
  const { files } = filming;
  const own = splitVolume(filming, pins).current;
  const pin = own.records.find((r) => r.record === ref.recordId);
  const pinned = pin === undefined ? null : pinnedTarget(pin);
  if (pinned !== null) return { volume: v, files, target: pinned };
  if (ref.page === null) return { volume: v, files, target: ESTIMATED_VOLUME };
  const counted = countedImage(own.pages, files.length, ref, own.records);
  if (counted === 'overran') {
    return { volume: v, files, target: ESTIMATED_VOLUME, overran: true };
  }
  const { image, from } = counted;
  if (image === null || image < 1 || image > files.length) {
    return { volume: v, files, target: ESTIMATED_VOLUME };
  }
  return {
    volume: v,
    files,
    target: { precision: 'image', image, certainty: 'estimated', from }
  };
}

// Pick the volumes to link. A volume whose Page pins don't reach the cited
// page isn't the one cited: split volumes often continue one page sequence
// (I: 1–600, II: 601–1200), and that beats the village guess.
function pickVolumes(located: Located[], places: string[], pins: Pins) {
  const reachable = located.filter((l) => l.overran !== true);
  const pool = reachable.length > 0 ? reachable : located;
  const byVillage = new Set(
    narrowByVillage(
      pool.map((l) => l.volume),
      places,
      pins
    )
  );
  return pool.filter((l) => byVillage.has(l.volume));
}

// A Link opens its Image, or the Volume's first when it has none.
function linkTo(
  volumeId: string,
  volume: string,
  files: string[],
  target: LinkTarget
): Link {
  const image = 'image' in target ? target.image : 1;
  return {
    volumeId,
    volume,
    url: viewerUrl(volumeId, files[image - 1]!),
    ...target
  };
}

function toLink(l: Located) {
  return linkTo(l.volume.id, l.volume.label, l.files, l.target);
}

// The pin's Link; null when it was made on another filming.
async function referenceLink(
  astia: Astia,
  p: ReferencePin,
  target: LinkTarget
) {
  const filming = await filmingOf(astia, p.volumeId);
  if (leavesOut(filming, p)) return null;
  return linkTo(p.volumeId, p.volume, filming.files, target);
}

async function volumesFor(
  astia: Astia,
  ref: ChurchBookRef,
  archiveId: string,
  pins: Pins
) {
  const volumes = await astia.archiveVolumes(archiveId);
  const filmed = filmedIn(volumes, ref.recordId, pins);
  return filmed.length > 0
    ? filmed
    : candidateVolumes(volumes, ref.kind!, ref.years!);
}

// Unlinked after looking through the parish's books: no Volume fits, or
// the one that does can't be shown.
const LOOKED: ReadonlySet<Unlinked> = new Set([
  'no-volume',
  'not-digitized',
  'no-images'
]);

// Where the reference links, in `archiveId`, its parish's archive (null
// when that isn't known). Each Link says whose archive its Volume is in;
// so does an Unlinked reference whose parish's books were looked through.
export async function resolveChurchBookRef(
  astia: Astia,
  ref: ChurchBookRef,
  pins: Pins,
  archiveId: string | null
): Promise<LinkResolution> {
  const resolved = await resolveLinks(astia, ref, pins, archiveId);
  if ('unlinked' in resolved && !LOOKED.has(resolved.unlinked)) return resolved;
  const archive =
    archiveId === null ? null : await astia.archiveTitle(archiveId);
  if (archive === null) return resolved;
  if ('unlinked' in resolved) return { ...resolved, archive };
  return { links: resolved.links.map((l) => ({ ...l, archive })) };
}

// The reference's own pin decides its Link, at whatever Precision; null
// when it has none that points anywhere now.
async function pinnedLink(astia: Astia, ref: ChurchBookRef, pins: Pins) {
  const pin = pins.references[ref.url];
  const pinned = pin === undefined ? null : pinnedTarget(pin);
  return pin === undefined || pinned === null
    ? null
    : await referenceLink(astia, pin, pinned);
}

async function resolveLinks(
  astia: Astia,
  ref: ChurchBookRef,
  pins: Pins,
  archiveId: string | null
): Promise<LinkResolution> {
  const pinned = await pinnedLink(astia, ref, pins);
  if (pinned !== null) return { links: [pinned] };
  if (ref.parish === null || ref.kind === null || ref.years === null) {
    return { unlinked: 'unparsed' };
  }
  if (archiveId === null) return { unlinked: 'no-archive' };
  const candidates = await volumesFor(astia, ref, archiveId, pins);
  if (candidates.length === 0) return { unlinked: 'no-volume' };
  const digitized = candidates.filter((v) => v.digitized);
  if (digitized.length === 0) return { unlinked: 'not-digitized' };
  const located = await Promise.all(
    digitized.map((v) => locate(astia, v, ref, pins))
  );
  const withImages = located.filter((l) => l.files.length > 0);
  if (withImages.length === 0) return { unlinked: 'no-images' };
  return { links: pickVolumes(withImages, ref.places, pins).map(toLink) };
}
