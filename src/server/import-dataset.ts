// The import pipeline behind the app's import endpoint: unpack a GEDZIP, parse
// the GEDCOM, convert it if it's a MyHeritage export (downloading remote
// media), ingest the media, and write the dataset's SQLite DB.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';

import type { DatasetInfo, ImportReview } from '@common/types';

import type { DatasetRegistry } from './dataset-registry';
import { importGedcom } from './gedcom-import';
import type { ImportStats } from './gedcom-import';
import { childValue, findChild, parseGedcom } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import { unpackGedzip } from './gedzip';
import { mergeImport } from './import-merge';
import { ingest } from './media-ingest';
import type { IngestSkipped } from './media-ingest';
import { localPaths } from './media-refs';
import { convertMyHeritage, isMyHeritageExport } from './myheritage';
import type { Downloader } from './myheritage';

// How many unnamed archive files the import's log lists by name.
const UNNAMED_LISTED = 10;

function readGedcomVersion(roots: GedNode[]): string | null {
  const head = roots.find((r) => r.tag === 'HEAD');
  if (head === undefined) return null;
  const gedc = findChild(head, 'GEDC');
  if (gedc === undefined) return null;
  return childValue(gedc, 'VERS');
}

export interface MyHeritageSummary {
  downloaded: number;
  urls: number;
  reused: number;
  stripped: number;
  dropped: number;
  failed: number;
}

// What an import reads: a GEDCOM's text, whose local media it can't reach
// (MyHeritage photos are fetched from their URLs regardless), or a GEDZIP
// holding a GEDCOM and its media.
export type ImportSource = { gedcom: string } | { gedzip: Uint8Array };

export interface ImportRequest {
  registry: DatasetRegistry;
  slug: string;
  // Human-readable name shown in the UI; keeps accents/casing the slug drops.
  // Falls back to the slug when omitted.
  displayName?: string;
  source: ImportSource;
  sourceFilename: string;
  // Fetches a MyHeritage photo; the network by default.
  download?: Downloader;
  log?: (msg: string) => void;
  // Asked, when the import merges into a dataset, whether to save it; it is
  // saved unasked without.
  review?: (review: ImportReview) => Promise<boolean>;
}

// An import its review said not to save.
export class ImportCancelled extends Error {
  constructor() {
    super('import cancelled');
  }
}

export interface ImportOutcome {
  info: DatasetInfo;
  stats: ImportStats;
  // What merging into the dataset there was changed; null for a new one.
  merged: ImportReview | null;
  skipped: IngestSkipped[];
  myheritage: MyHeritageSummary | null;
}

// Where each photo the dataset under `slug` has now is stored, by its
// original path: a re-import copies those rather than download them again,
// also from a dataset an older version built. Photos no longer in the new
// export aren't copied, so they go with the old dataset.
function storedPhotos(registry: DatasetRegistry, slug: string) {
  const stored = new Map<string, string>();
  const db = registry.readAny(slug);
  if (db === null) return stored;
  try {
    const mediaDir = registry.mediaDir(slug);
    const rows = db
      .query<{ original_path: string | null; file_path: string }, []>(
        'SELECT original_path, file_path FROM media'
      )
      .all();
    for (const r of rows) {
      if (r.original_path !== null) {
        stored.set(r.original_path, join(mediaDir, r.file_path));
      }
    }
  } finally {
    db.close();
  }
  return stored;
}

// Standard lines the database has nowhere to keep yet (ADR-0013).
function reportUnstored(stats: ImportStats, log: (msg: string) => void) {
  if (stats.unstored.length === 0) return;
  const listed = stats.unstored.map((u) => `${u.path} ×${u.count}`).join(', ');
  log(`Not stored: ${listed}`);
}

// Every FILE the GEDCOM gives, wherever it sits: the app reads only some of
// them, but an archive file any of them names isn't unnamed.
function fileValues(nodes: GedNode[]): string[] {
  return nodes.flatMap((n) => [
    ...(n.tag === 'FILE' && n.value !== undefined ? [n.value] : []),
    ...fileValues(n.children)
  ]);
}

// The archive's files that no FILE names, so nothing imports.
function reportUnnamed(
  files: string[],
  roots: GedNode[],
  log: (msg: string) => void
) {
  const named = new Set(fileValues(roots).flatMap(localPaths));
  const unnamed = files.filter((f) => !named.has(f));
  if (unnamed.length === 0) return;
  const listed = unnamed.slice(0, UNNAMED_LISTED).join(', ');
  const more =
    unnamed.length > UNNAMED_LISTED ? `, … (${unnamed.length} in all)` : '';
  log(`Not imported, as no FILE names them: ${listed}${more}`);
}

// The source's GEDCOM text, with a GEDZIP's media unpacked into `dir` and
// listed by the names they had in the archive.
async function readSource(
  source: ImportSource,
  dir: string,
  log: (msg: string) => void
) {
  if ('gedcom' in source) return { text: source.gedcom, archived: [] };
  log('Unpacking GEDZIP…');
  const { text, files } = await unpackGedzip(source.gedzip, dir);
  return { text, archived: files };
}

function readStored<T>(req: ImportRequest, read: (db: Database | null) => T) {
  const stored = req.registry.readAny(req.slug);
  try {
    return read(stored);
  } finally {
    stored?.close();
  }
}

// The import merged with the dataset already under its slug, and saved if
// its review says so; null when there's none to merge with.
async function mergeWith(req: ImportRequest, db: Database, stats: ImportStats) {
  if (!req.registry.exists(req.slug)) return null;
  req.log?.('Merging with the dataset…');
  const review = readStored(req, (stored) =>
    mergeImport(db, stored, stats.newUids === stats.persons + stats.families)
  );
  if (req.review !== undefined && !(await req.review(review))) {
    throw new ImportCancelled();
  }
  return review;
}

export async function importDataset(
  req: ImportRequest
): Promise<ImportOutcome> {
  const log = req.log ?? (() => undefined);

  // Build the dataset in a staging dir; publish it (commit) only once the whole
  // import succeeds, so a network drop or error mid-download never leaves a
  // half-imported dataset visible. Any failure discards the staged work.
  const workspace = await req.registry.createStaging(req.slug);
  // Where the media are ingested from: a GEDZIP's unpacked, or nothing for a
  // bare GEDCOM, whose local media refs then resolve as "missing" rather
  // than matching files in the cwd. A MyHeritage export's photos are
  // gathered in a folder of their own.
  let unpacked: string | null = null;
  let photoStaging: string | null = null;
  try {
    const { db, mediaDir } = workspace;

    unpacked = await mkdtemp(join(tmpdir(), 'sukulinja-import-'));
    let sourceDir = unpacked;
    const { text, archived } = await readSource(req.source, unpacked, log);

    log('Parsing GEDCOM…');
    const roots = parseGedcom(text);
    reportUnnamed(archived, roots, log);
    let myheritage: MyHeritageSummary | null = null;

    if (isMyHeritageExport(roots)) {
      const stored = storedPhotos(req.registry, req.slug);
      photoStaging = await mkdtemp(join(tmpdir(), 'myheritage-photos-'));
      const conv = await convertMyHeritage(roots, {
        stagingDir: photoStaging,
        stored: (name) => stored.get(name) ?? null,
        download: req.download,
        log
      });
      sourceDir = photoStaging;
      myheritage = {
        downloaded: conv.downloaded,
        urls: conv.urls,
        reused: conv.reused,
        stripped: conv.stripped,
        dropped: conv.dropped,
        failed: conv.failed.length
      };
    }

    log('Processing media…');
    const ingestResult = await ingest({
      roots,
      sourceDir,
      targetDir: mediaDir,
      log
    });

    log('Writing database…');
    const stats = importGedcom(
      db,
      roots,
      (rel) => ingestResult.resolved.get(rel) ?? null
    );
    reportUnstored(stats, log);

    const displayName = req.displayName ?? req.slug;
    const importedAt = new Date().toISOString();
    const writeMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    writeMeta.run('display_name', displayName);
    writeMeta.run('source_filename', req.sourceFilename);
    writeMeta.run('imported_at', importedAt);
    const version = readGedcomVersion(roots);
    if (version !== null) writeMeta.run('gedcom_version', version);

    const merged = await mergeWith(req, db, stats);

    log('Finishing…');
    await workspace.commit();

    return {
      info: {
        slug: req.slug,
        displayName,
        personCount: stats.persons,
        familyCount: stats.families,
        importedAt,
        outdated: false,
        undoable: merged !== null
      },
      stats,
      merged,
      skipped: ingestResult.skipped,
      myheritage
    };
  } catch (err) {
    await workspace.discard();
    throw err;
  } finally {
    await Promise.all(
      [unpacked, photoStaging]
        .filter((dir) => dir !== null)
        .map((dir) => rm(dir, { recursive: true, force: true }))
    );
  }
}
