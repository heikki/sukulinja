// A dataset as a GEDZIP: its GEDCOM 7 and every media file it links,
// the mirror of importing one (ADR-0013).

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { DatasetRegistry } from './dataset-registry';
import { exportGedcom } from './gedcom-export';
import { packGedzip } from './gedzip';

export async function exportDataset(registry: DatasetRegistry, slug: string) {
  const { text, entries } = exportGedcom(registry.open(slug));
  const mediaDir = registry.mediaDir(slug);
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
function freePath(dir: string, slug: string) {
  for (let n = 1; ; n += 1) {
    const path = join(dir, n === 1 ? `${slug}.gdz` : `${slug}-${n}.gdz`);
    if (!existsSync(path)) return path;
  }
}

// Exports the dataset into `dir`, and says where.
export async function saveExport(
  registry: DatasetRegistry,
  slug: string,
  dir = DOWNLOADS
) {
  const gdz = await exportDataset(registry, slug);
  await mkdir(dir, { recursive: true });
  const path = freePath(dir, slug);
  await Bun.write(path, gdz);
  return path;
}
