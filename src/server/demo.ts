// The demo a new data folder starts with: the House of Bourbon sample,
// imported from its GEDZIP as an upload is, so the current code always builds
// it. Offered once per data folder, which a marker records, and only to one
// with no datasets: deleting the demo never brings it back, and a reset that
// keeps the pins and caches (scripts/reset-install.sh) offers it again by
// removing the marker. A demo an older version built is imported again.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { DatasetRegistry } from './dataset-registry';
import { OutdatedDatasetError } from './db';
import { importDataset } from './import-dataset';

const MARKER = '.demo-offered';
const SLUG = 'bourbon';
const SOURCE_FILENAME = 'bourbon.gdz';

async function importDemo(registry: DatasetRegistry, gedzipPath: string) {
  try {
    await importDataset({
      registry,
      slug: SLUG,
      displayName: 'Bourbon',
      source: { gedzip: await Bun.file(gedzipPath).bytes() },
      sourceFilename: SOURCE_FILENAME
    });
  } catch (err) {
    console.error('Importing the demo failed:', err);
  }
}

// Whether the dataset under the demo's slug is the demo, built by an older
// version: nobody else has its GEDZIP to import it again with.
function isOutdatedDemo(registry: DatasetRegistry) {
  const db = registry.readAny(SLUG);
  if (db === null) return false;
  try {
    const row = db
      .query<{ value: string }, []>(
        "SELECT value FROM meta WHERE key = 'source_filename'"
      )
      .get();
    if (row?.value !== SOURCE_FILENAME) return false;
  } catch {
    return false;
  } finally {
    db.close();
  }
  try {
    registry.open(SLUG);
    return false;
  } catch (err) {
    return err instanceof OutdatedDatasetError;
  }
}

export async function seedDemo(registry: DatasetRegistry, gedzipPath: string) {
  if (isOutdatedDemo(registry)) {
    await importDemo(registry, gedzipPath);
    return;
  }
  const marker = join(registry.root, MARKER);
  if (existsSync(marker)) return;
  await mkdir(registry.root, { recursive: true });
  // Written first, so an import that fails isn't tried again on the next
  // launch.
  await Bun.write(marker, '');
  if ((await registry.list()).length > 0) return;
  await importDemo(registry, gedzipPath);
}
