// The one import pipeline, shared by the `import-ged` CLI and the in-app import
// endpoint: parse a GEDCOM, convert it if it's a MyHeritage export (downloading
// remote media), ingest the media, and write the dataset's SQLite DB.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DatasetInfo } from '@common/types';

import type { DatasetRegistry } from './dataset-registry';
import { importGedcom } from './gedcom-import';
import type { ImportStats } from './gedcom-import';
import { childValue, findChild, parseGedcom } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import { ingest } from './media-ingest';
import type { IngestSkipped } from './media-ingest';
import { convertMyHeritage, isMyHeritageExport } from './myheritage';

export function slugFromFilename(name: string): string {
  return name
    .replace(/\.ged(?:com)?$/iu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

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
  stripped: number;
  dropped: number;
  failed: number;
}

export interface ImportRequest {
  registry: DatasetRegistry;
  slug: string;
  text: string;
  sourceFilename: string;
  // Dir for resolving local (relative) media references. Omit for uploads that
  // ship only the GEDCOM — MyHeritage media is fetched from its URLs regardless.
  sourceDir?: string;
  forceMyHeritage?: boolean;
  keepCutouts?: boolean;
  log?: (msg: string) => void;
}

export interface ImportOutcome {
  info: DatasetInfo;
  stats: ImportStats;
  skipped: IngestSkipped[];
  myheritage: MyHeritageSummary | null;
}

export async function importDataset(
  req: ImportRequest
): Promise<ImportOutcome> {
  const roots = parseGedcom(req.text);
  const { db, mediaDir } = await req.registry.createFresh(req.slug);

  // Default to a path that won't exist, so an upload's local media refs simply
  // resolve as "missing" rather than accidentally matching files in the cwd.
  let sourceDir = req.sourceDir ?? join(tmpdir(), 'sukulinja-no-local-media');
  let staging: string | null = null;
  let myheritage: MyHeritageSummary | null = null;

  if (req.forceMyHeritage === true || isMyHeritageExport(roots)) {
    staging = await mkdtemp(join(tmpdir(), 'myheritage-'));
    const conv = await convertMyHeritage(roots, {
      stagingDir: staging,
      keepCutouts: req.keepCutouts ?? false,
      log: req.log
    });
    sourceDir = staging;
    myheritage = {
      downloaded: conv.downloaded,
      urls: conv.urls,
      stripped: conv.stripped,
      dropped: conv.dropped,
      failed: conv.failed.length
    };
  }

  const ingestResult = await ingest({ roots, sourceDir, targetDir: mediaDir });
  if (staging !== null) await rm(staging, { recursive: true, force: true });

  const stats = importGedcom(
    db,
    roots,
    (rel) => ingestResult.resolved.get(rel) ?? null
  );

  const importedAt = new Date().toISOString();
  const writeMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  writeMeta.run('display_name', req.slug);
  writeMeta.run('source_filename', req.sourceFilename);
  writeMeta.run('imported_at', importedAt);
  const version = readGedcomVersion(roots);
  if (version !== null) writeMeta.run('gedcom_version', version);

  return {
    info: {
      slug: req.slug,
      displayName: req.slug,
      personCount: stats.persons,
      familyCount: stats.families,
      importedAt
    },
    stats,
    skipped: ingestResult.skipped,
    myheritage
  };
}
