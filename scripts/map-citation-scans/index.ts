// One-off: map MyHeritage church-record citations to public scans in the
// National Archives' Astia service.
//
//   bun run scripts/map-citation-scans/index.ts <export.ged> [--dry-run]
//
// Writes data/citation-scans.json (one entry per citation) and
// data/citation-scans-checklist.md (cited volumes still lacking an anchor;
// see src/server/citation-scans/locate.ts). Astia responses are cached
// under data/.astia-cache.

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Scan, ScanResolution } from '@common/types';
import { loadAnchors, loadPlacements } from '@server/citation-scans/anchors';
import { CACHE_DIR } from '@server/citation-scans/astia';
import { resolveChurchBookRef } from '@server/citation-scans/locate';
import type { ChurchBookRef } from '@server/citation-scans/record';

import { churchBookRefs } from './citations';

const OUT_FILE = resolve('data/citation-scans.json');
const CHECKLIST_FILE = resolve('data/citation-scans-checklist.md');

function printTally(keys: string[]) {
  const tally = new Map<string, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  const sorted = [...tally].sort(([a], [b]) => a.localeCompare(b));
  for (const [k, n] of sorted) console.log(`${String(n).padStart(6)}  ${k}`);
}

function resolutionKey(c: ChurchBookRef, r: ScanResolution) {
  if ('error' in r) return `${c.collection} ✗ ${r.error}`;
  const ambiguous = r.scans.length > 1 ? ' (split volume)' : '';
  return `${c.collection} ${r.scans[0]!.method}${ambiguous}`;
}

interface ChecklistEntry {
  parish: string;
  count: number;
  scan: Scan;
}

// Cited volumes without an anchor, most-cited first: those where a page was
// estimated, and those where the estimate ran past the volume's end. Each
// links to an image to read, so checking it is one click.
function checklist(refs: ChurchBookRef[], resolutions: ScanResolution[]) {
  const byVolume = new Map<string, ChecklistEntry>();
  refs.forEach((c, i) => {
    const r = resolutions[i]!;
    if ('error' in r || c.page === null) return;
    for (const scan of r.scans) {
      if (scan.method === 'anchored') continue;
      const entry = byVolume.get(scan.volumeId) ?? {
        parish: c.parish!,
        count: 0,
        scan
      };
      entry.count += 1;
      byVolume.set(scan.volumeId, entry);
    }
  });
  const rows = [...byVolume.values()].sort((a, b) => b.count - a.count);
  const lines = [
    '# Volumes to anchor',
    '',
    'Open the link and read the number(s) written at the top of the image.',
    'Some books number each spread once (one number), others each page (two).',
    'Add to `src/server/citation-scans/anchors.json`:',
    '',
    '    "<volume id>": { "anchors": [{ "image": <image>, "pages": [<n>] }] }',
    '    "<volume id>": { "anchors": [{ "image": <image>, "pages": [<left>, <right>] }] }',
    '',
    'If the estimate drifts further into a volume (inserts, skipped numbers),',
    'add a second anchor there.',
    '',
    '| Citations | Parish | Volume | Volume id | Image | Link |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.count} | ${r.parish} | ${r.scan.volume} | ${r.scan.volumeId} | ${r.scan.image} | [open](${r.scan.url}) |`
    )
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: { 'dry-run': { type: 'boolean' } },
    allowPositionals: true
  });
  const input = positionals[0];
  if (input === undefined) {
    console.error(
      'usage: bun run scripts/map-citation-scans/index.ts <export.ged> [--dry-run]'
    );
    process.exit(2);
  }
  await mkdir(CACHE_DIR, { recursive: true });

  const refs = churchBookRefs(await Bun.file(resolve(input)).text());
  console.log(`${refs.length} church-book references`);

  if (values['dry-run'] === true) {
    printTally(
      refs.map(
        (c) =>
          `${c.collection} ${c.kind ?? '?'} ${c.parish ?? '?'}${c.page === null ? '' : ' +page'}`
      )
    );
    return;
  }

  const anchors = await loadAnchors();
  const placements = await loadPlacements();
  const resolutions = await Promise.all(
    refs.map((c) => resolveChurchBookRef(c, anchors, placements))
  );
  const results = refs.map((c, i) => ({ ...c, ...resolutions[i] }));
  await Bun.write(OUT_FILE, `${JSON.stringify(results, null, 2)}\n`);
  await Bun.write(CHECKLIST_FILE, checklist(refs, resolutions));
  printTally(refs.map((c, i) => resolutionKey(c, resolutions[i]!)));
  console.log(`wrote ${OUT_FILE}\nwrote ${CHECKLIST_FILE}`);
}

await main();
