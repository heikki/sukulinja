import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { openDb, resetData } from '@server/db';
import { importGedcom } from '@server/gedcom-import';
import { parseGedcom } from '@server/gedcom-parser';

async function main(): Promise<void> {
  const input = process.argv[2];
  if (input === undefined) {
    console.error('usage: bun run import-ged <path-to.ged>');
    process.exit(2);
  }
  const dbPath = resolve('data', 'app.db');
  mkdirSync(dirname(dbPath), { recursive: true });

  const t0 = performance.now();
  const text = await Bun.file(input).text();
  const t1 = performance.now();
  const roots = parseGedcom(text);
  const t2 = performance.now();

  const db = openDb(dbPath);
  resetData(db);
  const stats = importGedcom(db, roots);
  const t3 = performance.now();
  db.close();

  function round(n: number): string {
    return n.toFixed(0);
  }
  console.log(
    `read:    ${round(t1 - t0)} ms (${(text.length / 1024).toFixed(0)} KB)`
  );
  console.log(
    `parse:   ${round(t2 - t1)} ms (${roots.length} top-level records)`
  );
  console.log(`import:  ${round(t3 - t2)} ms`);
  console.log(`db:      ${dbPath}`);
  console.log('stats:', stats);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
