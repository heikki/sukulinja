// Port of the MyHeritage GEDCOM converter (formerly the standalone fix.py).
//
// A raw MyHeritage 5.5.1 export references every image as an `mhcache.com`
// URL whose token changes with every export, carries MyHeritage-private
// bloat, and marks face rectangles with a private `2 _POSITION x1 y1 x2 y2` tag that no
// other app understands. This module transforms such an export in place so the
// existing media-ingest + gedcom-import pipeline can consume it:
//
//   - drop the synthetic "Unassociated photos" person MyHeritage parks untagged
//     photos under (before downloading, so its photos aren't fetched)
//   - gather every referenced image into a staging dir, copied from the
//     dataset's earlier import where it's there, else downloaded, and rewrite
//     the FILE value to the photo's name (failed downloads keep the remote URL
//     so a re-run retries them)
//   - drop face-cutout OBJE blocks (each person keeps the parent photo with
//     their face rectangle, converted to CROP below)
//   - strip MyHeritage-private metadata and prune the empty leaves it leaves
//   - move each OBJE's FORM under its FILE as a MIME type, and convert
//     `_POSITION x1 y1 x2 y2` to a standard `CROP { TOP, LEFT, WIDTH, HEIGHT }`
//   - cite a baptism index entry by its bare number, whoever's citation it is

import { createHash } from 'node:crypto';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { BAPTISM_COLLECTION, collectionOf } from './citation-scans/record';
import { findChild } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import { mimeOf } from './media-refs';
import { runPool } from './pool';

const REFERER = 'https://www.myheritage.com/';
const UA = 'Mozilla/5.0';
// Per-attempt wall-clock deadline. mhcache.com rate-limits bursts by accepting
// the connection, sending headers, then stalling the body — so this must be a
// hard timeout the worker honours even if the body read ignores an abort.
const TIMEOUT_MS = 20_000;
const RETRIES = 1;
const DEFAULT_CONCURRENCY = 4;

// Keyed `<level>\t<tag>` — the same tag means different things at different
// depths, so drops are level-specific (mirrors fix.py's (level, tag) keys).
const DROP_TAGS = new Set([
  '1\t_UPD',
  '1\t_TYPE',
  '1\t_MEDI',
  '2\t_ALBUM',
  '2\t_FILESIZE',
  '2\t_PERSONALPHOTO',
  '2\t_PLACE',
  '2\t_DATE',
  '2\tEMAIL',
  // Only meaningful while their sibling cutout OBJE still exists, and the
  // cutouts are stripped.
  '2\t_PRIM_CUTOUT',
  '2\t_PARENTPHOTO',
  '2\t_PHOTO_RIN'
]);

// The fixed ID of the "Unassociated photos" person: a bucket for photos nobody
// is tagged in, not someone in the tree.
const UNASSOCIATED_PHOTOS_XREF = '@I88888888@';

// The transforms below recurse through children arrays and reassign each loop
// variable's `.children` (loop vars, not function parameters, so eslint's
// no-param-reassign stays satisfied) while still mutating the caller's tree.

function isCutout(obje: GedNode): boolean {
  return obje.children.some((c) => c.tag === '_CUTOUT' && c.value === 'Y');
}

export function dropUnassociatedPhotos(roots: GedNode[]) {
  const i = roots.findIndex(
    (r) => r.tag === 'INDI' && r.xref === UNASSOCIATED_PHOTOS_XREF
  );
  if (i === -1) return false;
  roots.splice(i, 1);
  return true;
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
    form.value = mimeOf(form.value ?? null) ?? undefined;
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

// MyHeritage's baptism index numbers each entry, and gives each person it
// names their own address for it: the number with "-" for the child, "-F"
// or "-M" for a parent, sometimes with the site (`s`) and the person in the
// tree (`indId`) it was saved from. Older exports give everyone the bare
// number, which opens the same entry. Cited by the bare number alone, every
// Citation of the entry is of one reference, so a Mark on one is on all.
function entryPage(page: string) {
  if (collectionOf(page) !== BAPTISM_COLLECTION || !URL.canParse(page)) {
    return page;
  }
  const url = new URL(page);
  const item = url.searchParams.get('itemId');
  if (item === null) return page;
  url.searchParams.set('itemId', item.replace(/-[A-Z]*$/u, ''));
  url.searchParams.delete('s');
  url.searchParams.delete('indId');
  return url.href;
}

export function plainEntryPages(roots: GedNode[]) {
  function visit(children: GedNode[]) {
    for (const c of children) {
      if (c.tag === 'PAGE' && c.value !== undefined) {
        c.value = entryPage(c.value);
      }
      visit(c.children);
    }
  }
  visit(roots);
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

// A photo's name: what its FILE is rewritten to, which the media row keeps
// as its original path, so a re-import finds the photo already stored. An
// mhcache.com URL is `/e/1/<token>/<tail>`: the token changes with every
// export, the tail stays and names the photo. Any other URL, or a tail that
// isn't plain path segments, is named by a hash of the whole URL.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/u;

export function photoNameOf(url: string) {
  const { hostname, pathname } = new URL(url);
  const segments = pathname.split('/').slice(1);
  const tail = segments.slice(3);
  const plain = tail.every(
    (s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..'
  );
  if (hostname.endsWith('mhcache.com') && tail.length > 0 && plain) {
    return tail.join('/');
  }
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `${hash}${extname(pathname).toLowerCase()}`;
}

// Fetches `url` into `dest`, and says 'ok' or why not.
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

interface MyHeritageOptions {
  // Where the photos are gathered, each at its name (see photoNameOf). Pass
  // it as the ingest sourceDir so the rewritten FILE values resolve.
  stagingDir: string;
  // Where a photo of that name is stored from the dataset's earlier import,
  // if it is: copied instead of downloaded.
  stored?: (name: string) => string | null;
  concurrency?: number;
  download?: Downloader;
  log?: (msg: string) => void;
}

interface MyHeritageResult {
  stripped: number;
  dropped: number;
  pruned: number;
  urls: number;
  // Photos downloaded, and copied from the dataset's earlier import.
  downloaded: number;
  reused: number;
  failed: string[];
}

// Detect a raw MyHeritage export so callers can branch without a flag.
export function isMyHeritageExport(roots: GedNode[]): boolean {
  const head = roots.find((r) => r.tag === 'HEAD');
  if (head === undefined) return false;
  const source = findChild(head, 'SOUR');
  if (source?.value?.toUpperCase().includes('MYHERITAGE') === true) return true;
  return collectFileUrls(roots).some((u) => u.includes('mhcache.com'));
}

// Downloads one photo: written under `.part`, and renamed into place only
// once whole, so a failed or stalled download never leaves a file that
// looks like the photo.
async function fetchInto(download: Downloader, url: string, dest: string) {
  await mkdir(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  try {
    const status = await download(url, part);
    if (status === 'ok') await rename(part, dest);
    return status;
  } finally {
    await rm(part, { force: true });
  }
}

async function copyStored(from: string | null, dest: string) {
  if (from === null || !(await Bun.file(from).exists())) return false;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(from, dest);
  return true;
}

// The photos stored from the dataset's earlier import, copied into the
// staging dir; the rest are missing.
async function copyAllStored(
  byName: Map<string, string[]>,
  { stagingDir, stored }: MyHeritageOptions
) {
  const succeeded = new Set<string>();
  const missing: Array<[string, string[]]> = [];
  for (const [name, same] of byName) {
    const dest = join(stagingDir, name);
    // eslint-disable-next-line no-await-in-loop -- a local copy per photo
    if (await copyStored(stored?.(name) ?? null, dest)) {
      for (const u of same) succeeded.add(u);
    } else {
      missing.push([name, same]);
    }
  }
  return { succeeded, missing };
}

// Each photo into the staging dir, by one copy or fetch however many URLs
// name it. Says which URLs it has, and which failed.
async function gatherPhotos(
  names: Map<string, string>,
  options: MyHeritageOptions
) {
  const { stagingDir } = options;
  const download = options.download ?? downloadDefault;
  const log = options.log ?? noop;
  const byName = new Map<string, string[]>();
  for (const [url, name] of names) {
    byName.set(name, [...(byName.get(name) ?? []), url]);
  }
  const { succeeded, missing } = await copyAllStored(byName, options);
  const failed: string[] = [];
  const reused = byName.size - missing.length;
  if (byName.size > 0) {
    log(`Downloading ${missing.length} photos, ${reused} kept from before…`);
  }
  let done = 0;
  let downloaded = 0;
  await runPool(
    missing,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async ([name, same]) => {
      done += 1;
      const url = same[0]!;
      const status = await fetchInto(download, url, join(stagingDir, name));
      if (status === 'ok') {
        downloaded += 1;
        for (const u of same) succeeded.add(u);
      } else {
        failed.push(...same);
        log(`  FAIL ${status}  ${url}`);
      }
      log(`Downloaded ${done}/${missing.length} photos`);
    }
  );
  return { succeeded, failed, downloaded, reused };
}

// MyHeritage's id for a person or family is GEDCOM 7's UID, kept as written.
export function standardUids(roots: GedNode[]) {
  for (const root of roots) {
    for (const child of root.children) {
      if (child.level === 1 && child.tag === '_UID') child.tag = 'UID';
    }
  }
}

export async function convertMyHeritage(
  roots: GedNode[],
  options: MyHeritageOptions
): Promise<MyHeritageResult> {
  dropUnassociatedPhotos(roots);
  const stripped = stripCutouts(roots);
  const dropped = dropTags(roots, DROP_TAGS);
  standardUids(roots);
  plainEntryPages(roots);
  const pruned = pruneEmptyLeaves(roots);

  const urls = collectFileUrls(roots);
  const names = new Map(urls.map((u) => [u, photoNameOf(u)]));
  const { succeeded, failed, downloaded, reused } = await gatherPhotos(
    names,
    options
  );

  rewriteLocalPaths(roots, succeeded, names);
  transformObjes(roots);

  return {
    stripped,
    dropped,
    pruned,
    urls: urls.length,
    downloaded,
    reused,
    failed
  };
}
