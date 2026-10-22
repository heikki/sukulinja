// A dataset as a GEDZIP: its GEDCOM 7 and every media file it links,
// the mirror of importing one (ADR-0013). Or as GEDCOM 5.5.1 for MyHeritage.

import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ExportKind } from '@common/types';

import { exportGedcom } from './gedcom-export';
import { exportGedcom551 } from './gedcom551';
import { packGedzip } from './gedzip';

// A dataset's database and its media folder, under its slug.
export interface Exported {
  slug: string;
  db: Database;
  mediaDir: string;
}

export async function packDataset(db: Database, mediaDir: string) {
  const { text, entries } = exportGedcom(db);
  const media = new Map<string, Uint8Array>();
  for (const [stored, entry] of entries) {
    // eslint-disable-next-line no-await-in-loop -- read one after another
    media.set(entry, await Bun.file(join(mediaDir, stored)).bytes());
  }
  return packGedzip(text, media);
}

// Where an export is saved unless told otherwise: the app runs in a web
// view that can't hand a download to the user, so it saves the file itself.
export const DOWNLOADS = join(homedir(), 'Downloads');

// A name in `dir` no file has yet: `ylonen.gdz`, then `ylonen-2.gdz`, …
function freePath(dir: string, name: string, ext: string) {
  for (let n = 1; ; n += 1) {
    const path = join(dir, n === 1 ? `${name}${ext}` : `${name}-${n}${ext}`);
    if (!existsSync(path)) return path;
  }
}

async function exportOf({ slug, db, mediaDir }: Exported, kind: ExportKind) {
  if (kind === 'gdz') {
    return {
      bytes: await packDataset(db, mediaDir),
      left: [],
      name: slug,
      ext: '.gdz'
    };
  }
  const { text, left } = exportGedcom551(db);
  return { bytes: text, left, name: `${slug}-myheritage`, ext: '.ged' };
}

// Exports the dataset into `dir`, and says where, and what was left out.
export async function saveExport(
  dataset: Exported,
  { dir = DOWNLOADS, kind }: { dir?: string; kind: ExportKind }
) {
  const { bytes, left, name, ext } = await exportOf(dataset, kind);
  await mkdir(dir, { recursive: true });
  const path = freePath(dir, name, ext);
  await Bun.write(path, bytes);
  return { path, left };
}
