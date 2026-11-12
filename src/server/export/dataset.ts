// A dataset as a GEDZIP: its GEDCOM 7 and every media file it links,
// the mirror of importing one (ADR-0013).

import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { packGedzip } from '../gedcom/gedzip';
import { exportGedcom } from './gedcom';

// A dataset's database and its media folder, under its slug.
interface Exported {
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
const DOWNLOADS = join(homedir(), 'Downloads');

// A name in `dir` no file has yet: `ylonen.gdz`, then `ylonen-2.gdz`, …
function freePath(dir: string, name: string, ext: string) {
  for (let n = 1; ; n += 1) {
    const path = join(dir, n === 1 ? `${name}${ext}` : `${name}-${n}${ext}`);
    if (!existsSync(path)) return path;
  }
}

// Exports the dataset's GEDZIP into `dir`, and says where.
export async function saveExport(
  { slug, db, mediaDir }: Exported,
  { dir = DOWNLOADS }: { dir?: string } = {}
) {
  const bytes = await packDataset(db, mediaDir);
  await mkdir(dir, { recursive: true });
  const path = freePath(dir, slug, '.gdz');
  await Bun.write(path, bytes);
  return { path };
}
