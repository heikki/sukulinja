// Church-book reference → Astia volume → image.
//
// Astia knows only image order, so a cited page is turned into an image via
// Page pins (pins.json): what's written on one image. One number means the
// book numbers spreads (`pages: [77]`); two mean it numbers pages
// (`pages: [40, 41]`). Where MyHeritage's indexer misread the page number,
// a Page pin gives the number as cited and a `note` says what's written.
// Without one we guess from the spot checks so far: rippikirjat number
// spreads, lastenkirjat pages.
//
// Which volume a reference is in comes from its book's years, then the
// villages and page numbers. Where that's known exactly, a volume lists the
// Record ranges on its film: MyHeritage numbers each film's records in one
// block, in image order, and blocks don't overlap, so a record pinned on a
// film places every record numbered around it there too. A Record pin puts
// its record on a known image; so does a Reference pin its reference.

import type {
  Box,
  Link,
  LinkResolution,
  LinkTarget,
  Provenance
} from '@common/types';

import { viewerUrl } from './astia';
import type { Astia, Volume } from './astia';
import type { ChurchBookRef } from './record';
import type { BookKind, Years } from './text';

// Astia fonds ("… seurakunnan arkisto") per parish as MyHeritage and
// FamilySearch spell it. Parish archives are top-level in Astia, so these
// were looked up once by hand. FamilySearch's "Mikkeli" baptisms predate
// the town parish (1844) and live in the rural parish's books.
const PARISH_ARCHIVE: Record<string, string> = {
  'Antrea': '1200716382',
  'Hankasalmi': '1194659536',
  'Haukivuori': '1202439501',
  'Hirvensalmi': '1203505721',
  'Joroinen': '1212061565',
  'Juva': '1212295491',
  'Kangasniemi': '1212989643',
  'Kirvu': '1852428855',
  'Kivennapa': '1853665727',
  'Mikkeli': '1854401336',
  'Mikkeli Maaseurakunta': '1854401336',
  'Mäntyharju': '1856083369',
  'Pieksamaki': '1225495701',
  'Pieksämäki': '1225495701',
  'Rautalampi': '1192981148',
  'Sääminki': '1231967062'
};

// Pins say who saved them; a missing `by` is by hand, which covers the
// shipped ones and every local file written before the vision model.
export interface PagePin {
  image: number;
  pages: number[];
  note?: string;
  by?: Provenance;
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
}

// What's known of one volume: its Page pins, the villages found in it where
// a book is split in parts without village ranges in their labels, the
// Record ranges on its film, and its Record pins.
export interface VolumePins {
  title?: string;
  pages: PagePin[];
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
  const certainty = pin.by === 'vision' ? 'vision' : 'marked';
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

interface Numbering {
  image: number;
  first: number;
  pagesPerImage: number;
}

function defaultNumbering(kind: BookKind): Numbering {
  return kind === 'lasten'
    ? { image: 1, first: 0, pagesPerImage: 2 }
    : { image: 1, first: 1, pagesPerImage: 1 };
}

function imageFor(n: Numbering, page: number) {
  return n.image + Math.floor((page - n.first) / n.pagesPerImage);
}

// Between two Page pins a page is placed proportionally, which spreads
// unnumbered or inserted leaves over the gap; elsewhere it's counted from
// the nearest one. Page pins out of image order (a misread page, see
// above) are only counted from.
function countedImage(pins: PagePin[], page: number) {
  const numbered = pins
    .filter((a) => a.pages.length > 0)
    .map((a) => ({
      image: a.image,
      first: Math.min(...a.pages),
      pagesPerImage: a.pages.length
    }))
    .sort((a, b) => a.first - b.first);
  const lo = numbered.filter((n) => n.first <= page).at(-1);
  const hi = numbered.find((n) => n.first > page);
  if (lo === undefined || hi === undefined) {
    const only = lo ?? hi;
    return only === undefined ? null : imageFor(only, page);
  }
  if (page < lo.first + lo.pagesPerImage) return lo.image;
  if (hi.image > lo.image) {
    const share = (page - lo.first) / (hi.first - lo.first);
    return lo.image + Math.floor(share * (hi.image - lo.image));
  }
  return imageFor(page - lo.first <= hi.first - page ? lo : hi, page);
}

interface Located {
  volume: Volume;
  files: string[];
  target: LinkTarget;
  // Counted from the volume's Page pins, the cited page fell outside it.
  overran?: boolean;
}

function recordPin(v: Volume, ref: ChurchBookRef, pins: Pins) {
  return pins.volumes[v.id]?.records?.find((r) => r.record === ref.recordId);
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
  const files = await astia.volumeImages(v.id);
  const pin = recordPin(v, ref, pins);
  const pinned = pin === undefined ? null : pinnedTarget(pin);
  if (pinned !== null) return { volume: v, files, target: pinned };
  if (ref.page === null) return { volume: v, files, target: ESTIMATED_VOLUME };
  const counted = countedImage(pins.volumes[v.id]?.pages ?? [], ref.page);
  const image = counted ?? imageFor(defaultNumbering(ref.kind!), ref.page);
  const from = counted === null ? 'numbering' : 'pins';
  if (image < 1 || image > files.length) {
    return {
      volume: v,
      files,
      target: ESTIMATED_VOLUME,
      overran: from === 'pins'
    };
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

// The Astia fonds of the parish, however it's spelled; null for one not
// looked up.
export function parishArchive(parish: string | null) {
  return parish === null ? null : (PARISH_ARCHIVE[parish] ?? null);
}

// The parish's population-register volumes, for checking a Mark.
export async function parishVolumes(astia: Astia, parish: string | null) {
  const archiveId = parishArchive(parish);
  return archiveId === null ? [] : await astia.archiveVolumes(archiveId);
}

async function referenceLink(
  astia: Astia,
  p: ReferencePin,
  target: LinkTarget
) {
  const files = await astia.volumeImages(p.volumeId);
  return linkTo(p.volumeId, p.volume, files, target);
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

// The Links, each saying whose archive its Volume is in.
async function withArchive(astia: Astia, links: Link[], parish: string | null) {
  const archiveId = parishArchive(parish);
  const archive =
    archiveId === null ? null : await astia.archiveTitle(archiveId);
  return archive === null ? links : links.map((l) => ({ ...l, archive }));
}

export async function resolveChurchBookRef(
  astia: Astia,
  ref: ChurchBookRef,
  pins: Pins
): Promise<LinkResolution> {
  const resolved = await resolveLinks(astia, ref, pins);
  if ('unlinked' in resolved) return resolved;
  return { links: await withArchive(astia, resolved.links, ref.parish) };
}

// The reference's own pin decides its Link, at whatever Precision; null
// when it has none that points anywhere.
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
  pins: Pins
): Promise<LinkResolution> {
  const pinned = await pinnedLink(astia, ref, pins);
  if (pinned !== null) return { links: [pinned] };
  if (ref.parish === null || ref.kind === null || ref.years === null) {
    return { unlinked: 'unparsed' };
  }
  const archiveId = PARISH_ARCHIVE[ref.parish];
  if (archiveId === undefined) return { unlinked: 'no-archive' };
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
