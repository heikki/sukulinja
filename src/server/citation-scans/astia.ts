// The National Archives' Astia service: an archive unit's children, a
// volume's images and the images themselves. Resolution and the Scan
// viewer reach it through an Astia; openAstia's goes over HTTP, and tests
// give their own (memory-astia.ts).

import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { bookKind, decodeEntities, yearRange } from './text';
import type { BookKind, Years } from './text';

const ASTIA = 'https://astia.narc.fi/uusiastia';
const USER_AGENT = 'sukulinja-citation-mapper/0.1';
const REQUEST_GAP_MS = 1000;
const BACKOFF_MS = 30_000;

// How long a request keeps trying: its attempts, the first wait after a
// server error (doubling after each), and the longest wait worth making —
// a 429's backoff or a Retry-After past it ends the request.
interface Patience {
  attempts: number;
  waitMs: number;
  maxWaitMs: number;
}

// The crawl runs unattended, so it rides out an outage.
const CRAWL: Patience = { attempts: 6, waitMs: 5000, maxWaitMs: Infinity };
// The Scan viewer is waiting: retry a blip, give up on an outage.
const VIEWER: Patience = { attempts: 3, waitMs: 500, maxWaitMs: 2000 };

// Series under the population-register archive that can't hold the books
// we look for; skipping them keeps the crawl small.
const SKIP_SERIES =
  /muutt|kuoll|haudat|vieras|rikos|asevelv|perukir|rippilast|kinkeri|eronn|ilmoitu|kirjeist|kortist|toisteet/i;

export interface Unit {
  id: string;
  level: string;
  label: string;
  digitized: boolean;
}

export interface Volume extends Unit {
  kind: BookKind | null;
  // The whole span, and the ranges it holds: a span with gaps lists them.
  years: Years | null;
  parts: Years[];
}

export type ImageSize = 'full' | 'thumb';

export interface Astia {
  // Volumes of the archive's population register (I VÄESTÖREKISTERIARKISTO).
  archiveVolumes: (archiveId: string) => Promise<Volume[]>;
  // File ids of the volume's images, in viewer order: full size, or the
  // 250px thumbnails Astia lists beside them.
  volumeImages: (volumeId: string, size?: ImageSize) => Promise<string[]>;
  // The archive's title as Astia gives it ("Pieksämäen seurakunnan
  // arkisto"); null when Astia can't say.
  archiveTitle: (archiveId: string) => Promise<string | null>;
  // One image file, for someone waiting on it.
  imageBytes: (volumeId: string, fileId: string) => Promise<Uint8Array>;
}

// A request to Astia failed: it couldn't be reached, refused, or gave
// nothing. It passes, so callers report it and try again later; any other
// error is a bug.
export class AstiaError extends Error {
  override name = 'AstiaError';
}

export function viewerUrl(volumeId: string, fileId: string) {
  return `${ASTIA}/viewer/?fileId=${fileId}&aineistoId=${volumeId}`;
}

// Astia's viewer URL for each of the volume's images, in order.
export async function viewerUrls(astia: Astia, volumeId: string) {
  return (await astia.volumeImages(volumeId)).map((f) =>
    viewerUrl(volumeId, f)
  );
}

// ---------------------------------------------------------------- labels

const RANGE = /(?<from>1[5-9]\d\d)\s*-\s*(?<to>1[5-9]\d\d)/g;

function toYears(groups: Record<string, string> | undefined) {
  return { from: Number(groups!.from), to: Number(groups!.to) };
}

// "I Aa:3 Pää- ja rippikirjat, 1766-1771, 1788-1789 kylät Hankamäki-Orala
// (1766-1789)": the bracketed range at the end spans the whole volume; the
// ones before it are its parts.
export function volumeYears(label: string) {
  const span = /\((?<from>1[5-9]\d\d)\s*-\s*(?<to>1[5-9]\d\d)\)\s*$/.exec(
    label
  );
  if (span === null) {
    const years = yearRange(label);
    return { years, parts: years === null ? [] : [years] };
  }
  const listed = [...label.slice(0, span.index).matchAll(RANGE)].map((m) =>
    toYears(m.groups)
  );
  const years = toYears(span.groups);
  return { years, parts: listed.length > 0 ? listed : [years] };
}

// A volume unit, with what its label says it holds.
export function volumeOf(unit: Unit): Volume {
  return { ...unit, kind: bookKind(unit.label), ...volumeYears(unit.label) };
}

// ---------------------------------------------------------------- over HTTP

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface AstiaOptions {
  // What requests go out through, and the gap kept between them.
  fetch?: Fetch;
  gapMs?: number;
}

// Astia returns XML converted to JSON: elements as {name, children, tagData}.
interface XmlNode {
  name: string;
  tagData?: string;
  children?: XmlNode[];
}

function childValue(node: XmlNode, name: string) {
  return node.children?.find((c) => c.name === name)?.tagData ?? '';
}

function isBlank(bytes: Uint8Array) {
  return bytes.every((b) => b === 0x20 || (b >= 0x09 && b <= 0x0d));
}

function hasContent(bytes: Uint8Array) {
  return !isBlank(bytes);
}

// Astia's Images are all JPEGs. Now and then it answers with its "no
// preview" placeholder, a PNG, instead: a blip like an empty answer, which
// a cache would otherwise keep for good.
function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

// How long to wait before trying again, or null to stop here.
function retryWait(
  res: Response,
  empty: boolean,
  patience: Patience,
  attempt: number
) {
  const retryable = res.status === 429 || res.status >= 500 || empty;
  if (!retryable || attempt >= patience.attempts) return null;
  const retryAfter = Number(res.headers.get('Retry-After'));
  const base = res.status === 429 ? BACKOFF_MS : patience.waitMs;
  const wait = retryAfter > 0 ? retryAfter * 1000 : base * 2 ** (attempt - 1);
  return wait <= patience.maxWaitMs ? wait : null;
}

function unitsOf(json: { sisaltyvat?: XmlNode[] | '' }) {
  const children = json.sisaltyvat === '' ? [] : (json.sisaltyvat ?? []);
  return children.map((c): Unit => ({
    id: childValue(c, 'ID'),
    level: childValue(c, 'TASO'),
    label: decodeEntities(childValue(c, 'LABEL')),
    digitized: childValue(c, 'DIGI') === 'true'
  }));
}

// Astia over HTTP. Its answers about archives and volumes are kept in
// `cacheDir` for good, and those requests go out one at a time with a gap,
// so callers can fan out with Promise.all. Images aren't kept here (the
// Scan cache keeps them) or queued: Astia's own ZIP download fetches them
// back to back, so callers queue them as they see fit.
export function openAstia(cacheDir: string, options: AstiaOptions = {}): Astia {
  const send = options.fetch ?? fetch;
  const gapMs = options.gapMs ?? REQUEST_GAP_MS;
  let gate: Promise<unknown> = Promise.resolve();
  const inflight = new Map<string, Promise<unknown>>();
  const volumesByArchive = new Map<string, Promise<Volume[]>>();

  function throttled<T>(fn: () => Promise<T>) {
    const run = gate.then(fn);
    gate = run.catch(() => undefined).then(() => Bun.sleep(gapMs));
    return run;
  }

  // A request that can't reach Astia is an AstiaError too.
  async function reach(path: string) {
    try {
      return await send(`${ASTIA}/${path}`, {
        headers: { 'User-Agent': USER_AGENT }
      });
    } catch (err) {
      throw new AstiaError(`${String(err)} on ${path}`, { cause: err });
    }
  }

  // Astia answers the odd request with a transient 500, or a 200 that
  // isn't the answer (empty, or not `usable`); retry those as well as 429s.
  // One that persists means "nothing here" and comes back as null.
  async function request(
    path: string,
    patience: Patience,
    attempt: number,
    usable = hasContent
  ): Promise<Uint8Array | null> {
    const res = await reach(path);
    const body = res.ok ? await res.bytes() : new Uint8Array();
    const empty = res.ok && !usable(body);
    const wait = retryWait(res, empty, patience, attempt);
    if (wait !== null) {
      const why = empty ? 'unusable response' : String(res.status);
      console.log(`  ${why} on ${path}, waiting ${Math.round(wait / 1000)}s`);
      await Bun.sleep(wait);
      return await request(path, patience, attempt + 1, usable);
    }
    if (empty) return null;
    if (!res.ok) throw new AstiaError(`${res.status} ${path}`);
    return body;
  }

  async function cachedFetch(key: string, path: string) {
    const cached = Bun.file(join(cacheDir, `${key}.json`));
    if (await cached.exists()) return (await cached.json()) as unknown;
    const bytes = await throttled(() => request(path, CRAWL, 1));
    const body = bytes === null ? '{}' : new TextDecoder().decode(bytes);
    await Bun.write(cached, body);
    return JSON.parse(body) as unknown;
  }

  function fetchJson(path: string) {
    const key = createHash('sha1').update(path).digest('hex');
    let hit = inflight.get(key);
    if (hit === undefined) {
      hit = cachedFetch(key, path);
      inflight.set(key, hit);
      // A failure isn't kept: the app keeps running, and Astia comes back.
      hit.catch(() => inflight.delete(key));
    }
    return hit;
  }

  async function readOne(id: string) {
    return (await fetchJson(`ws/aineisto/readOne.php?id=${id}`)) as {
      sisaltyvat?: XmlNode[] | '';
      titles?: string;
    };
  }

  async function crawlSeries(id: string): Promise<Volume[]> {
    const units = unitsOf(await readOne(id));
    const volumes = units.filter((u) => u.level === 'file').map(volumeOf);
    const series = units.filter(
      (u) => u.level !== 'file' && !SKIP_SERIES.test(u.label)
    );
    const nested = await Promise.all(series.map((u) => crawlSeries(u.id)));
    return [...volumes, ...nested.flat()];
  }

  async function crawlArchive(archiveId: string) {
    const units = unitsOf(await readOne(archiveId));
    const register = units.find((u) => /VÄESTÖREKISTERI/i.test(u.label));
    return register === undefined ? [] : await crawlSeries(register.id);
  }

  return {
    archiveVolumes(archiveId) {
      let hit = volumesByArchive.get(archiveId);
      if (hit === undefined) {
        hit = crawlArchive(archiveId);
        volumesByArchive.set(archiveId, hit);
        hit.catch(() => volumesByArchive.delete(archiveId));
      }
      return hit;
    },

    async volumeImages(volumeId, size = 'full') {
      const json = (await fetchJson(
        `ws/aineisto/digitoidut.php?id=${volumeId}`
      )) as { isot?: XmlNode[]; pienet?: XmlNode[] };
      const files = size === 'full' ? json.isot : json.pienet;
      return (files ?? []).map((f) => childValue(f, 'URL'));
    },

    async archiveTitle(archiveId) {
      try {
        const title = (await readOne(archiveId)).titles ?? '';
        return title === '' ? null : decodeEntities(title);
      } catch {
        return null;
      }
    },

    async imageBytes(volumeId, fileId) {
      const path = `ws/getFile.php?fileId=${fileId}&aineistoId=${volumeId}`;
      const body = await request(path, VIEWER, 1, isJpeg);
      if (body === null) throw new AstiaError(`no image ${path}`);
      return body;
    }
  };
}
