import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DatasetRegistry } from '@server/dataset-registry';
import { importGedcom } from '@server/gedcom-import';
import {
  childValue,
  findChild,
  parseGedcom,
  type GedNode
} from '@server/gedcom-parser';
import { ingest } from '@server/media-ingest';

function slugFromFilename(name: string): string {
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

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: { name: { type: 'string' } },
    allowPositionals: true
  });
  const input = positionals[0];
  if (input === undefined) {
    console.error('usage: bun run import-ged <path-to.ged> [--name <slug>]');
    process.exit(2);
  }
  const inputAbs = resolve(input);
  const sourceDir = dirname(inputAbs);
  const slug = values.name ?? slugFromFilename(basename(inputAbs));

  const registry = new DatasetRegistry(resolve('data'));

  const t0 = performance.now();
  const text = await Bun.file(inputAbs).text();
  const t1 = performance.now();
  const roots = parseGedcom(text);
  const t2 = performance.now();

  const { db, mediaDir } = await registry.createFresh(slug);

  const ingestResult = await ingest({
    roots,
    sourceDir,
    targetDir: mediaDir
  });
  const t3 = performance.now();

  const stats = importGedcom(
    db,
    roots,
    (originalRelpath) => ingestResult.resolved.get(originalRelpath) ?? null
  );
  const t4 = performance.now();

  const writeMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  writeMeta.run('display_name', slug);
  writeMeta.run('source_filename', basename(inputAbs));
  writeMeta.run('imported_at', new Date().toISOString());
  const version = readGedcomVersion(roots);
  if (version !== null) writeMeta.run('gedcom_version', version);

  db.close();

  function ms(n: number): string {
    return n.toFixed(0);
  }
  console.log(`dataset: ${slug}`);
  console.log(
    `  read:   ${ms(t1 - t0)} ms (${(text.length / 1024).toFixed(0)} KB)`
  );
  console.log(
    `  parse:  ${ms(t2 - t1)} ms (${roots.length} top-level records)`
  );
  console.log(
    `  media:  ${ms(t3 - t2)} ms (${ingestResult.resolved.size} copied, ${ingestResult.skipped.length} skipped)`
  );
  console.log(`  import: ${ms(t4 - t3)} ms`);
  console.log('stats:', stats);
  if (ingestResult.skipped.length > 0) {
    console.log('skipped media:');
    for (const s of ingestResult.skipped.slice(0, 10)) {
      console.log(`  [${s.reason}] ${s.originalRelpath}`);
    }
    if (ingestResult.skipped.length > 10) {
      console.log(`  ... and ${ingestResult.skipped.length - 10} more`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
