// The demo a new data folder starts with: the House of Bourbon sample,
// imported from its GEDZIP as an upload is, so the current code always builds
// it. Seeded only when the data folder doesn't exist yet, so deleting the demo
// never brings it back.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import type { DatasetRegistry } from './dataset-registry';
import { importDataset } from './import-dataset';

export async function seedDemo(registry: DatasetRegistry, gedzipPath: string) {
  if (existsSync(registry.root)) return;
  // Made first, so an import that fails isn't tried again on the next launch.
  await mkdir(registry.root, { recursive: true });
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
