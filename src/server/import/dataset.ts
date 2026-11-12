// The import pipeline the registry runs: unpack a GEDZIP, parse the GEDCOM,
// convert it if it's a MyHeritage export (downloading remote media), ingest
// the media and write the new dataset's SQLite DB.

import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { unpackGedzip } from '../gedcom/gedzip';
import { localPaths } from '../gedcom/media-refs';
import { childValue, findChild, parseGedcom } from '../gedcom/parser';
import type { GedNode } from '../gedcom/parser';
import { importGedcom } from './gedcom';
import type { ImportStats } from './gedcom';
import { ingest } from './media-ingest';
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

interface MyHeritageSummary {
  downloaded: number;
  urls: number;
  stripped: number;
  dropped: number;
  failed: number;
}

// What an import reads: a GEDCOM's text, whose local media it can't reach
// (MyHeritage photos are fetched from their URLs regardless), or a GEDZIP
// holding a GEDCOM and its media.
export type ImportSource = { gedcom: string } | { gedzip: Uint8Array };

export interface ImportRequest {
  slug: string;
  // Human-readable name shown in the UI; keeps accents/casing the slug drops.
  // Falls back to the slug when omitted.
  displayName?: string;
  source: ImportSource;
  sourceFilename: string;
  // Fetches a MyHeritage photo; the network by default.
  download?: Downloader;
  log?: (msg: string) => void;
}

// Where an import is built: a staged database and media folder. An import
// only makes a new dataset (ADR-0021).
interface ImportInto {
  db: Database;
  mediaDir: string;
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

// Builds the import into `into`, and says what it read; the registry
// writes its meta and commits it, or discards it when this throws.
export async function buildImport(into: ImportInto, req: ImportRequest) {
  const log = req.log ?? (() => undefined);
  // Where the media are ingested from: a GEDZIP's unpacked, or nothing for a
  // bare GEDCOM, whose local media refs then resolve as "missing" rather
  // than matching files in the cwd. A MyHeritage export's photos are
  // gathered in a folder of their own.
  let unpacked: string | null = null;
  let photoStaging: string | null = null;
  try {
    unpacked = await mkdtemp(join(tmpdir(), 'sukulinja-import-'));
    let sourceDir = unpacked;
    const { text, archived } = await readSource(req.source, unpacked, log);

    log('Parsing GEDCOM…');
    const roots = parseGedcom(text);
    reportUnnamed(archived, roots, log);
    let myheritage: MyHeritageSummary | null = null;

    if (isMyHeritageExport(roots)) {
      photoStaging = await mkdtemp(join(tmpdir(), 'myheritage-photos-'));
      const conv = await convertMyHeritage(roots, {
        stagingDir: photoStaging,
        download: req.download,
        log
      });
      sourceDir = photoStaging;
      myheritage = {
        downloaded: conv.downloaded,
        urls: conv.urls,
        stripped: conv.stripped,
        dropped: conv.dropped,
        failed: conv.failed.length
      };
    }

    log('Processing media…');
    const ingestResult = await ingest({
      roots,
      sourceDir,
      targetDir: into.mediaDir,
      log
    });

    log('Writing database…');
    const stats = importGedcom(
      into.db,
      roots,
      (rel) => ingestResult.resolved.get(rel) ?? null
    );
    reportUnstored(stats, log);

    return {
      stats,
      skipped: ingestResult.skipped,
      myheritage,
      gedcomVersion: readGedcomVersion(roots)
    };
  } finally {
    await Promise.all(
      [unpacked, photoStaging]
        .filter((dir) => dir !== null)
        .map((dir) => rm(dir, { recursive: true, force: true }))
    );
  }
}
