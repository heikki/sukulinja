// Citation → Astia volume → image.
//
// Astia knows only image order, so a cited page is turned into an image via
// anchors (anchors.json): what's written on one image, read off the scan by
// hand. One number means the book numbers spreads (`pages: [77]`); two mean
// it numbers pages (`pages: [40, 41]`). Without an anchor we guess from the
// spot checks so far: rippikirjat number spreads, lastenkirjat pages.

import { archiveVolumes, viewerUrl, volumeImages } from './astia';
import type { Volume } from './astia';
import type { Citation } from './citations';
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

interface Anchor {
  image: number;
  pages: number[];
}

export type Anchors = Record<string, { title?: string; anchors: Anchor[] }>;

export type Method = 'anchored' | 'estimated' | 'volume';

export interface Scan {
  volumeId: string;
  volume: string;
  image: number;
  url: string;
  method: Method;
}

export type Resolution = { scans: Scan[] } | { error: string };

// ---------------------------------------------------------------- volumes

function overlap(a: Years, b: Years) {
  return Math.min(a.to, b.to) - Math.max(a.from, b.from) + 1;
}

// Exact year range first, then volumes containing the cited range, then the
// best partial overlap (MyHeritage and Astia sometimes disagree by a year).
function candidateVolumes(volumes: Volume[], kind: BookKind, years: Years) {
  const sameKind = volumes.filter((v) => v.kind === kind && v.years !== null);
  const exact = sameKind.filter(
    (v) => v.years!.from === years.from && v.years!.to === years.to
  );
  if (exact.length > 0) return exact;
  const containing = sameKind.filter(
    (v) => v.years!.from <= years.from && v.years!.to >= years.to
  );
  if (containing.length > 0) return containing;
  const best = Math.max(0, ...sameKind.map((v) => overlap(v.years!, years)));
  return best === 0
    ? []
    : sameKind.filter((v) => overlap(v.years!, years) === best);
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

// Among volumes split by village, keep those whose range covers one of the
// citation's place names; if none does, the split can't be decided here.
function narrowByVillage(volumes: Volume[], places: string[]) {
  if (volumes.length < 2) return volumes;
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

// The anchor with the highest number at or below `page`, else the lowest.
function anchorNumbering(anchors: Anchor[], page: number) {
  const numbered = anchors
    .filter((a) => a.pages.length > 0)
    .map((a) => ({
      image: a.image,
      first: Math.min(...a.pages),
      pagesPerImage: a.pages.length
    }))
    .sort((a, b) => a.first - b.first);
  return numbered.filter((n) => n.first <= page).at(-1) ?? numbered[0] ?? null;
}

function imageFor(n: Numbering, page: number) {
  return n.image + Math.floor((page - n.first) / n.pagesPerImage);
}

interface Located {
  volume: Volume;
  files: string[];
  image: number | null;
  method: Method;
}

async function locate(
  v: Volume,
  c: Citation,
  anchors: Anchors
): Promise<Located> {
  const files = await volumeImages(v.id);
  if (c.page === null) {
    return { volume: v, files, image: null, method: 'volume' };
  }
  const anchored = anchorNumbering(anchors[v.id]?.anchors ?? [], c.page);
  const numbering = anchored ?? defaultNumbering(c.kind!);
  const image = imageFor(numbering, c.page);
  const inside = image >= 1 && image <= files.length;
  return {
    volume: v,
    files,
    image: inside ? image : null,
    method: anchored === null ? 'estimated' : 'anchored'
  };
}

// Pick the volumes to link. An anchored volume whose numbering doesn't
// reach the cited page isn't the one cited: split volumes often continue one
// page sequence (I: 1–600, II: 601–1200), and that beats the village guess.
function pickVolumes(located: Located[], places: string[]) {
  const reachable = located.filter(
    (l) => !(l.method === 'anchored' && l.image === null)
  );
  const pool = reachable.length > 0 ? reachable : located;
  const byVillage = new Set(
    narrowByVillage(
      pool.map((l) => l.volume),
      places
    )
  );
  return pool.filter((l) => byVillage.has(l.volume));
}

function toScan(l: Located): Scan {
  const image = l.image ?? 1;
  return {
    volumeId: l.volume.id,
    volume: l.volume.label,
    image,
    url: viewerUrl(l.volume.id, l.files[image - 1]!),
    method: l.image === null ? 'volume' : l.method
  };
}

export async function resolveCitation(
  c: Citation,
  anchors: Anchors
): Promise<Resolution> {
  if (c.parish === null || c.kind === null || c.years === null) {
    return { error: 'unparsed' };
  }
  const archiveId = PARISH_ARCHIVE[c.parish];
  if (archiveId === undefined) return { error: `no archive for ${c.parish}` };
  const candidates = candidateVolumes(
    await archiveVolumes(archiveId),
    c.kind,
    c.years
  );
  if (candidates.length === 0) return { error: 'no matching volume' };
  const digitized = candidates.filter((v) => v.digitized);
  if (digitized.length === 0) return { error: 'not digitized' };
  const located = await Promise.all(
    digitized.map((v) => locate(v, c, anchors))
  );
  const withImages = located.filter((l) => l.files.length > 0);
  if (withImages.length === 0) return { error: 'no images' };
  return { scans: pickVolumes(withImages, c.places).map(toScan) };
}
