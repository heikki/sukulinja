// The National Archives' Astia service: its JSON endpoints for an archive
// unit's children and a volume's images. Requests go out one at a time
// with a gap, retry transient failures, and are cached on disk.

import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

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
// Kept in the data folder given (see useDataFolder); until then, the cwd's.
let cacheDir = resolve('data/.astia-cache');

export function setCacheDir(dir: string) {
  cacheDir = dir;
}

// Series under the population-register archive that can't hold the books
// we look for; skipping them keeps the crawl small.
const SKIP_SERIES =
  /muutt|kuoll|haudat|vieras|rikos|asevelv|perukir|rippilast|kinkeri|eronn|ilmoitu|kirjeist|kortist|toisteet/i;

interface Unit {
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

// ---------------------------------------------------------------- fetching

let gate: Promise<unknown> = Promise.resolve();
const inflight = new Map<string, Promise<unknown>>();

// All requests queue behind one gate, so callers can fan out with
// Promise.all and Astia still sees one request every REQUEST_GAP_MS.
function throttled<T>(fn: () => Promise<T>) {
  const run = gate.then(fn);
  gate = run.catch(() => undefined).then(() => Bun.sleep(REQUEST_GAP_MS));
  return run;
}

function fetchJson(path: string) {
  const key = createHash('sha1').update(path).digest('hex');
  let hit = inflight.get(key);
  if (hit === undefined) {
    hit = cachedFetch(key, path);
    inflight.set(key, hit);
    // A failure isn't cached: the app keeps running, and Astia comes back.
    hit.catch(() => inflight.delete(key));
  }
  return hit;
}

async function cachedFetch(key: string, path: string) {
  const cached = Bun.file(join(cacheDir, `${key}.json`));
  if (await cached.exists()) return (await cached.json()) as unknown;
  const bytes = await throttled(() => request(path, CRAWL, 1));
  const body = bytes === null ? '{}' : new TextDecoder().decode(bytes);
  await Bun.write(cached, body);
  return JSON.parse(body) as unknown;
}

function isBlank(bytes: Uint8Array) {
  return bytes.every((b) => b === 0x20 || (b >= 0x09 && b <= 0x0d));
}

// Astia answers the odd request with a transient 500 or an empty 200;
// retry those as well as 429s. An empty body that persists means "nothing
// here" and comes back as null.
async function request(
  path: string,
  patience: Patience,
  attempt: number
): Promise<Uint8Array | null> {
  const res = await fetch(`${ASTIA}/${path}`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  const body = res.ok ? await res.bytes() : new Uint8Array();
  const empty = res.ok && isBlank(body);
  const wait = retryWait(res, empty, patience, attempt);
  if (wait !== null) {
    const why = empty ? 'empty response' : String(res.status);
    console.log(`  ${why} on ${res.url}, waiting ${Math.round(wait / 1000)}s`);
    await Bun.sleep(wait);
    return await request(path, patience, attempt + 1);
  }
  if (empty) return null;
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return body;
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

// ---------------------------------------------------------------- endpoints

// Astia returns XML converted to JSON: elements as {name, children, tagData}.
interface XmlNode {
  name: string;
  tagData?: string;
  children?: XmlNode[];
}

function childValue(node: XmlNode, name: string) {
  return node.children?.find((c) => c.name === name)?.tagData ?? '';
}

async function readUnit(id: string) {
  const json = (await fetchJson(`ws/aineisto/readOne.php?id=${id}`)) as {
    sisaltyvat: XmlNode[] | '';
  };
  const children = json.sisaltyvat === '' ? [] : json.sisaltyvat;
  return children.map((c): Unit => ({
    id: childValue(c, 'ID'),
    level: childValue(c, 'TASO'),
    label: decodeEntities(childValue(c, 'LABEL')),
    digitized: childValue(c, 'DIGI') === 'true'
  }));
}

// The archive's title as Astia gives it ("Pieksämäen seurakunnan
// arkisto"); null when Astia can't say.
export async function archiveTitle(archiveId: string) {
  try {
    const json = (await fetchJson(
      `ws/aineisto/readOne.php?id=${archiveId}`
    )) as { titles?: string };
    const title = json.titles ?? '';
    return title === '' ? null : decodeEntities(title);
  } catch {
    return null;
  }
}

async function volumeFiles(volumeId: string) {
  return (await fetchJson(`ws/aineisto/digitoidut.php?id=${volumeId}`)) as {
    isot?: XmlNode[];
    pienet?: XmlNode[];
  };
}

export type ImageSize = 'full' | 'thumb';

// File ids of the volume's images, in viewer order: full size, or the 250px
// thumbnails Astia lists beside them.
export async function volumeImages(volumeId: string, size: ImageSize = 'full') {
  const json = await volumeFiles(volumeId);
  const files = size === 'full' ? json.isot : json.pienet;
  return (files ?? []).map((f) => childValue(f, 'URL'));
}

// One image file, as Astia's viewer fetches it, for someone waiting on it.
// Not throttled: Astia's own ZIP download fetches images back to back, so
// callers queue them as they see fit.
export async function imageBytes(volumeId: string, fileId: string) {
  const path = `ws/getFile.php?fileId=${fileId}&aineistoId=${volumeId}`;
  const body = await request(path, VIEWER, 1);
  if (body === null) throw new Error(`empty image ${path}`);
  return body;
}

export function viewerUrl(volumeId: string, fileId: string) {
  return `${ASTIA}/viewer/?fileId=${fileId}&aineistoId=${volumeId}`;
}

// Astia's viewer URL for each of the volume's images, in order.
export async function viewerUrls(volumeId: string) {
  return (await volumeImages(volumeId)).map((f) => viewerUrl(volumeId, f));
}

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

async function crawlSeries(id: string): Promise<Volume[]> {
  const units = await readUnit(id);
  const volumes = units
    .filter((u) => u.level === 'file')
    .map((u) => ({
      ...u,
      kind: bookKind(u.label),
      ...volumeYears(u.label)
    }));
  const series = units.filter(
    (u) => u.level !== 'file' && !SKIP_SERIES.test(u.label)
  );
  const nested = await Promise.all(series.map((u) => crawlSeries(u.id)));
  return [...volumes, ...nested.flat()];
}

const volumesByArchive = new Map<string, Promise<Volume[]>>();

// Volumes of the archive's population register (I VÄESTÖREKISTERIARKISTO).
export function archiveVolumes(archiveId: string) {
  let hit = volumesByArchive.get(archiveId);
  if (hit === undefined) {
    hit = readUnit(archiveId).then((units) => {
      const register = units.find((u) => /VÄESTÖREKISTERI/i.test(u.label));
      return register === undefined ? [] : crawlSeries(register.id);
    });
    volumesByArchive.set(archiveId, hit);
    hit.catch(() => volumesByArchive.delete(archiveId));
  }
  return hit;
}
