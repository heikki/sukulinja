import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DatasetRegistry } from '@server/dataset-registry';
import { importDataset, slugFromFilename } from '@server/import-dataset';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'name': { type: 'string' },
      'myheritage': { type: 'boolean' },
      'keep-cutouts': { type: 'boolean' }
    },
    allowPositionals: true
  });
  const input = positionals[0];
  if (input === undefined) {
    console.error(
      'usage: bun run import-ged <path-to.ged> [--name <slug>] [--myheritage] [--keep-cutouts]'
    );
    process.exit(2);
  }
  const inputAbs = resolve(input);
  const slug = values.name ?? slugFromFilename(basename(inputAbs));

  const registry = new DatasetRegistry(resolve('data'));

  const t0 = performance.now();
  const text = await Bun.file(inputAbs).text();
  const outcome = await importDataset({
    registry,
    slug,
    text,
    sourceDir: dirname(inputAbs),
    sourceFilename: basename(inputAbs),
    forceMyHeritage: values.myheritage === true,
    keepCutouts: values['keep-cutouts'] === true,
    log: (m) => {
      console.log(m);
    }
  });
  const ms = (performance.now() - t0).toFixed(0);

  console.log(`dataset: ${slug} (${ms} ms)`);
  const mh = outcome.myheritage;
  if (mh !== null) {
    const failedNote = mh.failed > 0 ? `, ${mh.failed} failed` : '';
    console.log(
      `  myheritage: ${mh.downloaded}/${mh.urls} downloaded, ${mh.stripped} cutouts stripped, ${mh.dropped} tags dropped${failedNote}`
    );
  }
  console.log('stats:', outcome.stats);
  if (outcome.skipped.length > 0) {
    console.log(`skipped media: ${outcome.skipped.length}`);
    for (const s of outcome.skipped.slice(0, 10)) {
      console.log(`  [${s.reason}] ${s.originalRelpath}`);
    }
    if (outcome.skipped.length > 10) {
      console.log(`  ... and ${outcome.skipped.length - 10} more`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
