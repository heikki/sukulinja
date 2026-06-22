// Port of the MyHeritage GEDCOM converter (formerly the standalone fix.py).
//
// A raw MyHeritage 5.5.1 export references every image as a signed
// `mhcache.com` URL (valid ~1 week), carries MyHeritage-private bloat, and
// marks face rectangles with a private `2 _POSITION x1 y1 x2 y2` tag that no
// other app understands. This module transforms such an export in place so the
// existing media-ingest + gedcom-import pipeline can consume it:
//
//   - download every referenced image into a flat staging dir and rewrite the
//     FILE value to the local name (failed downloads keep the remote URL so a
//     re-run retries them)
//   - drop face-cutout OBJE blocks (each person keeps the parent photo with
//     their face rectangle, converted to CROP below)
//   - strip MyHeritage-private metadata and prune the empty leaves it leaves
//   - move each OBJE's FORM under its FILE as a MIME type, and convert
//     `_POSITION x1 y1 x2 y2` to a standard `CROP { TOP, LEFT, WIDTH, HEIGHT }`

import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { findChild } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import { runPool } from './pool';

const REFERER = 'https://www.myheritage.com/';
const UA = 'Mozilla/5.0';
// Per-attempt wall-clock deadline. mhcache.com rate-limits bursts by accepting
// the connection, sending headers, then stalling the body — so this must be a
// hard timeout the worker honours even if the body read ignores an abort.
const TIMEOUT_MS = 20_000;
const RETRIES = 1;
const DEFAULT_CONCURRENCY = 4;

const FORM_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime'
};

// Keyed `<level>\t<tag>` — the same tag means different things at different
// depths, so drops are level-specific (mirrors fix.py's (level, tag) keys).
const DROP_TAGS_ALWAYS = new Set([
  '1\t_UPD',
  '1\t_UID',
  '1\t_TYPE',
  '1\t_MEDI',
  '2\t_ALBUM',
  '2\t_FILESIZE',
  '2\t_PERSONALPHOTO',
  '2\t_PLACE',
  '2\t_DATE',
  '2\tEMAIL'
]);

// Only meaningful while their sibling cutout OBJE still exists.
const DROP_TAGS_WHEN_STRIPPING = new Set([
  '2\t_PRIM_CUTOUT',
  '2\t_PARENTPHOTO',
  '2\t_PHOTO_RIN'
]);

// The transforms below recurse through children arrays and reassign each loop
// variable's `.children` (loop vars, not function parameters, so eslint's
// no-param-reassign stays satisfied) while still mutating the caller's tree.

function isCutout(obje: GedNode): boolean {
  return obje.children.some((c) => c.tag === '_CUTOUT' && c.value === 'Y');
}

export function stripCutouts(roots: GedNode[]) {
  let removed = 0;
  function visit(children: GedNode[]): GedNode[] {
    const kept: GedNode[] = [];
    for (const c of children) {
      if (c.tag === 'OBJE' && isCutout(c)) {
        removed += 1;
        continue;
      }
      c.children = visit(c.children);
      kept.push(c);
    }
    return kept;
  }
  for (const r of roots) r.children = visit(r.children);
  return removed;
}

export function dropTags(roots: GedNode[], dropSet: Set<string>) {
  let dropped = 0;
  function visit(children: GedNode[]): GedNode[] {
    const kept: GedNode[] = [];
    for (const c of children) {
      if (dropSet.has(`${c.level}\t${c.tag}`)) {
        dropped += 1;
        continue;
      }
      c.children = visit(c.children);
      kept.push(c);
    }
    return kept;
  }
  for (const r of roots) r.children = visit(r.children);
  return dropped;
}

// Bottom-up: drop children with no value and no surviving children.
export function pruneEmptyLeaves(roots: GedNode[]) {
  let pruned = 0;
  function visit(children: GedNode[]): GedNode[] {
    const kept: GedNode[] = [];
    for (const c of children) {
      c.children = visit(c.children);
      if (
        (c.value === undefined || c.value === '') &&
        c.children.length === 0
      ) {
        pruned += 1;
      } else {
        kept.push(c);
      }
    }
    return kept;
  }
  for (const r of roots) r.children = visit(r.children);
  return pruned;
}

function leaf(level: number, tag: string, value: string): GedNode {
  return { level, tag, value, children: [] };
}

function transformObje(obje: GedNode): void {
  const file = findChild(obje, 'FILE');
  if (file === undefined) return;

  const form = findChild(obje, 'FORM');
  if (form !== undefined) {
    obje.children.splice(obje.children.indexOf(form), 1);
    form.level = file.level + 1;
    form.value = FORM_MIME[(form.value ?? '').toLowerCase()] ?? form.value;
    file.children.unshift(form);
  }

  const position = findChild(obje, '_POSITION');
  if (position === undefined) return;
  const nums = (position.value ?? '')
    .split(/\s+/u)
    .filter((s) => s !== '')
    .map(Number);
  if (nums.length !== 4 || !nums.every(Number.isInteger)) return;
  const [x1, y1, x2, y2] = nums as [number, number, number, number];
  const cl = file.level + 1;
  file.children.push({
    level: cl,
    tag: 'CROP',
    children: [
      leaf(cl + 1, 'TOP', String(y1)),
      leaf(cl + 1, 'LEFT', String(x1)),
      leaf(cl + 1, 'WIDTH', String(x2 - x1)),
      leaf(cl + 1, 'HEIGHT', String(y2 - y1))
    ]
  });
  obje.children.splice(obje.children.indexOf(position), 1);
}

export function transformObjes(roots: GedNode[]): void {
  function walk(node: GedNode): void {
    for (const c of node.children) {
      if (c.tag === 'OBJE') transformObje(c);
      walk(c);
    }
  }
  for (const r of roots) walk(r);
}

export function collectFileUrls(roots: GedNode[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  function walk(n: GedNode): void {
    const v = n.value;
    if (n.tag === 'FILE' && v !== undefined && /^https?:\/\//u.test(v)) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    for (const c of n.children) walk(c);
  }
  for (const r of roots) walk(r);
  return out;
}

// Map each URL to a unique flat filename derived from its basename; disambiguate
// the rare collision so two distinct images never share one staging file.
function assignNames(urls: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const url of urls) {
    const base = basename(new URL(url).pathname);
    let name = base === '' ? 'file' : base;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 1;
      while (used.has(`${stem}-${i}${ext}`)) i += 1;
      name = `${stem}-${i}${ext}`;
    }
    used.add(name);
    names.set(url, name);
  }
  return names;
}

export type Downloader = (url: string, dest: string) => Promise<string>;

// Settle `task`, but give up after `ms` and throw instead. This is the part
// that actually frees a stuck pool worker: `AbortController` alone isn't enough
// because a stalled response-body read doesn't reliably observe the abort, so we
// stop waiting on the promise regardless of whether the read ever unblocks.
async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  // Either side that loses the race keeps running; swallow its eventual
  // settlement so a late rejection isn't reported as an unhandled rejection.
  task.catch(() => undefined);
  const ac = new AbortController();
  const timeout = (async (): Promise<never> => {
    await delay(ms, undefined, { signal: ac.signal });
    throw new Error(`timed out after ${ms}ms`);
  })();
  timeout.catch(() => undefined);
  try {
    return await Promise.race([task, timeout]);
  } finally {
    ac.abort(); // cancels the pending delay when the task wins
  }
}

async function fetchToFile(
  url: string,
  dest: string,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': REFERER },
    signal
  });
  if (!res.ok) return `fail(${res.status})`;
  await Bun.write(dest, res);
  return 'ok';
}

async function downloadDefault(url: string, dest: string): Promise<string> {
  const existing = Bun.file(dest);
  if ((await existing.exists()) && existing.size > 0) return 'skip';
  let last = 'fail';
  /* eslint-disable no-await-in-loop -- retries are inherently sequential; each attempt must finish before the next */
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    // Signal the abort as a courtesy (frees the socket when honoured); the
    // withTimeout race is what guarantees the worker moves on either way.
    const controller = new AbortController();
    try {
      const status = await withTimeout(
        fetchToFile(url, dest, controller.signal),
        TIMEOUT_MS
      );
      if (status === 'ok') return 'ok';
      last = status;
    } catch (err) {
      last = `fail(${err instanceof Error ? err.message : String(err)})`;
    } finally {
      controller.abort();
    }
  }
  /* eslint-enable no-await-in-loop */
  return last;
}

function rewriteLocalPaths(
  roots: GedNode[],
  succeeded: Set<string>,
  names: Map<string, string>
): void {
  // Iterate children (loop variables, not the recursion parameter) so the
  // value rewrite doesn't trip no-param-reassign. FILE nodes are never roots.
  function visit(children: GedNode[]): void {
    for (const c of children) {
      if (c.tag === 'FILE' && c.value !== undefined && succeeded.has(c.value)) {
        c.value = names.get(c.value)!;
      }
      visit(c.children);
    }
  }
  for (const r of roots) visit(r.children);
}

function noop(): void {
  /* default logger: discard messages */
}

export interface MyHeritageOptions {
  // Flat dir the remote images are downloaded into; pass this as the ingest
  // sourceDir so the rewritten FILE basenames resolve.
  stagingDir: string;
  keepCutouts?: boolean;
  concurrency?: number;
  download?: Downloader;
  log?: (msg: string) => void;
}

export interface MyHeritageResult {
  stripped: number;
  dropped: number;
  pruned: number;
  urls: number;
  downloaded: number;
  failed: string[];
  sourceDir: string;
}

// Detect a raw MyHeritage export so callers can branch without a flag.
export function isMyHeritageExport(roots: GedNode[]): boolean {
  const head = roots.find((r) => r.tag === 'HEAD');
  if (head === undefined) return false;
  const source = findChild(head, 'SOUR');
  if (source?.value?.toUpperCase().includes('MYHERITAGE') === true) return true;
  return collectFileUrls(roots).some((u) => u.includes('mhcache.com'));
}

export async function convertMyHeritage(
  roots: GedNode[],
  options: MyHeritageOptions
): Promise<MyHeritageResult> {
  const { stagingDir, keepCutouts = false } = options;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const download = options.download ?? downloadDefault;
  const log = options.log ?? noop;

  const strip = !keepCutouts;
  const stripped = strip ? stripCutouts(roots) : 0;

  const dropSet = new Set(DROP_TAGS_ALWAYS);
  if (strip) for (const t of DROP_TAGS_WHEN_STRIPPING) dropSet.add(t);
  const dropped = dropTags(roots, dropSet);
  const pruned = pruneEmptyLeaves(roots);

  const urls = collectFileUrls(roots);
  const names = assignNames(urls);
  const succeeded = new Set<string>();
  const failed: string[] = [];

  if (urls.length > 0) {
    await mkdir(stagingDir, { recursive: true });
    log(`Downloading ${urls.length} photos…`);
    let done = 0;
    await runPool(urls, concurrency, async (url) => {
      const status = await download(url, join(stagingDir, names.get(url)!));
      if (status === 'ok' || status === 'skip') {
        succeeded.add(url);
      } else {
        failed.push(url);
        log(`  FAIL ${status}  ${url}`);
      }
      done += 1;
      log(`Downloaded ${done}/${urls.length} photos`);
    });
  }

  rewriteLocalPaths(roots, succeeded, names);
  transformObjes(roots);

  return {
    stripped,
    dropped,
    pruned,
    urls: urls.length,
    downloaded: succeeded.size,
    failed,
    sourceDir: stagingDir
  };
}
