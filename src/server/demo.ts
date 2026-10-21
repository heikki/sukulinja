// The demo a new data folder starts with: the House of Bourbon sample,
// imported from its GEDZIP as an upload is, so the current code always builds
// it. Offered once per data folder, which a marker records, and only to one
// with no datasets: deleting the demo never brings it back, and a reset that
// keeps the pins and caches (scripts/reset-install.sh) offers it again by
// removing the marker.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { DatasetRegistry } from './dataset-registry';
import { importDataset } from './import-dataset';

const MARKER = '.demo-offered';

export async function seedDemo(registry: DatasetRegistry, gedzipPath: string) {
  const marker = join(registry.root, MARKER);
  if (existsSync(marker)) return;
  await mkdir(registry.root, { recursive: true });
  // Written first, so an import that fails isn't tried again on the next
  // launch.
  await Bun.write(marker, '');
  if ((await registry.list()).length > 0) return;
  try {
    await importDataset({
      registry,
      slug: 'bourbon',
      displayName: 'Bourbon',
      source: { gedzip: await Bun.file(gedzipPath).bytes() },
      sourceFilename: 'bourbon.gdz'
    });
  } catch (err) {
    console.error('Importing the demo failed:', err);
  }
}
