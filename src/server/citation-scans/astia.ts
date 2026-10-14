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
const SERVER_ERROR_BACKOFF_MS = 5000;
const MAX_ATTEMPTS = 6;
export const CACHE_DIR = resolve('data/.astia-cache');

// The app keeps the cache in its data folder; the script uses CACHE_DIR.
let cacheDir = CACHE_DIR;

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
  const body = await throttled(() => request(path, 1));
  await Bun.write(cached, body);
  return JSON.parse(body) as unknown;
}

// Astia answers the odd request with a transient 500 or an empty 200;
// retry those as well as 429s. An empty body that persists means "nothing
// here" and comes back as `{}`.
async function request(path: string, attempt: number): Promise<string> {
  const res = await fetch(`${ASTIA}/${path}`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  const body = res.ok ? await res.text() : '';
  const empty = res.ok && body.trim() === '';
  const retryable = res.status === 429 || res.status >= 500 || empty;
  if (retryable && attempt < MAX_ATTEMPTS) {
    await backOff(res, attempt, empty ? 'empty response' : String(res.status));
    return await request(path, attempt + 1);
  }
  if (empty) return '{}';
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return body;
}

async function backOff(res: Response, attempt: number, why: string) {
  const retryAfter = Number(res.headers.get('Retry-After'));
  const base = res.status === 429 ? BACKOFF_MS : SERVER_ERROR_BACKOFF_MS;
  const wait = retryAfter > 0 ? retryAfter * 1000 : base * 2 ** (attempt - 1);
  console.log(`  ${why} on ${res.url}, waiting ${Math.round(wait / 1000)}s`);
  await Bun.sleep(wait);
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

async function volumeFiles(volumeId: string) {
  return (await fetchJson(`ws/aineisto/digitoidut.php?id=${volumeId}`)) as {
    isot?: XmlNode[];
    pienet?: XmlNode[];
  };
}

// File ids of the volume's full-size images, in viewer order.
export async function volumeImages(volumeId: string) {
  const json = await volumeFiles(volumeId);
  return (json.isot ?? []).map((f) => childValue(f, 'URL'));
}

// The image a viewer link's file is: the viewer names files from either
// list Astia gives, full size or small, both in image order.
export async function imageOfFile(volumeId: string, fileId: string) {
  const json = await volumeFiles(volumeId);
  for (const list of [json.isot ?? [], json.pienet ?? []]) {
    const i = list.findIndex((f) => childValue(f, 'URL') === fileId);
    if (i >= 0) return i + 1;
  }
  return null;
}

export function viewerUrl(volumeId: string, fileId: string) {
  return `${ASTIA}/viewer/?fileId=${fileId}&aineistoId=${volumeId}`;
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
