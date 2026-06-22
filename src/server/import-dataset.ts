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

export { slugFromFilename } from '@common/slug';

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
  // Human-readable name shown in the UI; keeps accents/casing the slug drops.
  // Falls back to the slug when omitted (e.g. the CLI).
  displayName?: string;
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
  const log = req.log ?? (() => undefined);
  log('Parsing GEDCOM…');
  const roots = parseGedcom(req.text);

  // Build the dataset in a staging dir; publish it (commit) only once the whole
  // import succeeds, so a network drop or error mid-download never leaves a
  // half-imported dataset visible. Any failure discards the staged work.
  const workspace = await req.registry.createStaging(req.slug);
  try {
    const { db, mediaDir } = workspace;

    // Default to a path that won't exist, so an upload's local media refs simply
    // resolve as "missing" rather than accidentally matching files in the cwd.
    let sourceDir = req.sourceDir ?? join(tmpdir(), 'sukulinja-no-local-media');
    let mediaStaging: string | null = null;
    let myheritage: MyHeritageSummary | null = null;

    if (req.forceMyHeritage === true || isMyHeritageExport(roots)) {
      mediaStaging = await mkdtemp(join(tmpdir(), 'myheritage-'));
      const conv = await convertMyHeritage(roots, {
        stagingDir: mediaStaging,
        keepCutouts: req.keepCutouts ?? false,
        log
      });
      sourceDir = mediaStaging;
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
      targetDir: mediaDir,
      log
    });
    if (mediaStaging !== null) {
      await rm(mediaStaging, { recursive: true, force: true });
    }

    log('Writing database…');
    const stats = importGedcom(
      db,
      roots,
      (rel) => ingestResult.resolved.get(rel) ?? null
    );

    const displayName = req.displayName ?? req.slug;
    const importedAt = new Date().toISOString();
    const writeMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    writeMeta.run('display_name', displayName);
    writeMeta.run('source_filename', req.sourceFilename);
    writeMeta.run('imported_at', importedAt);
    const version = readGedcomVersion(roots);
    if (version !== null) writeMeta.run('gedcom_version', version);

    log('Finishing…');
    await workspace.commit();

    return {
      info: {
        slug: req.slug,
        displayName,
        personCount: stats.persons,
        familyCount: stats.families,
        importedAt
      },
      stats,
      skipped: ingestResult.skipped,
      myheritage
    };
  } catch (err) {
    await workspace.discard();
    throw err;
  }
}
