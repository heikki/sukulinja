// One-off: map MyHeritage church-record citations to public scans in the
// National Archives' Astia service.
//
//   bun run scripts/map-citation-scans/index.ts <export.ged> [--data <folder>]
//     [--dry-run]
//
// Resolves with the pins of the data folder (default `data`), and writes
// there citation-scans.json (one entry per citation) and
// citation-scans-checklist.md (cited volumes still lacking a Page pin; see
// src/server/citation-scans/locate.ts). Astia responses are cached under
// its .astia-cache.

import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Link, LinkResolution } from '@common/types';
import { openAstia } from '@server/citation-scans/astia';
import type { ChurchBookRef } from '@server/citation-scans/record';
import { openScanFolder } from '@server/citation-scans/scans';
import { openDb } from '@server/db';

import { churchBookRefs } from './citations';

function printTally(keys: string[]) {
  const tally = new Map<string, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  const sorted = [...tally].sort(([a], [b]) => a.localeCompare(b));
  for (const [k, n] of sorted) console.log(`${String(n).padStart(6)}  ${k}`);
}

function resolutionKey(c: ChurchBookRef, r: LinkResolution) {
  if ('unlinked' in r) return `${c.collection} ✗ ${r.unlinked}`;
  const ambiguous = r.links.length > 1 ? ' (split volume)' : '';
  return `${c.collection} ${r.links[0]!.certainty}${ambiguous}`;
}

interface ChecklistEntry {
  parish: string;
  count: number;
  link: Link;
}

// Cited volumes without a Page pin, most-cited first: those where a page was
// estimated, and those where the estimate ran past the volume's end. Each
// links to an image to read, so checking it is one click.
function checklist(refs: ChurchBookRef[], resolutions: LinkResolution[]) {
  const byVolume = new Map<string, ChecklistEntry>();
  refs.forEach((c, i) => {
    const r = resolutions[i]!;
    if ('unlinked' in r || c.page === null) return;
    for (const link of r.links) {
      if (link.precision === 'image' && link.from === 'pins') continue;
      const entry = byVolume.get(link.volumeId) ?? {
        parish: c.parish!,
        count: 0,
        link
      };
      entry.count += 1;
      byVolume.set(link.volumeId, entry);
    }
  });
  const rows = [...byVolume.values()].sort((a, b) => b.count - a.count);
  const lines = [
    '# Volumes to pin',
    '',
    'Open the link and read the number(s) written at the top of the image.',
    'Some books number each spread once (one number), others each page (two).',
    'Add under `volumes` in `src/server/citation-scans/pins.json`:',
    '',
    '    "<volume id>": { "pages": [{ "image": <image>, "pages": [<n>] }] }',
    '    "<volume id>": { "pages": [{ "image": <image>, "pages": [<left>, <right>] }] }',
    '',
    'If the estimate drifts further into a volume (inserts, skipped numbers),',
    'add a second Page pin there.',
    '',
    '| Citations | Parish | Volume | Volume id | Image | Link |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.count} | ${r.parish} | ${r.link.volume} | ${r.link.volumeId} | ${'image' in r.link ? r.link.image : ''} | [open](${r.link.url}) |`
    )
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: { 'dry-run': { type: 'boolean' }, 'data': { type: 'string' } },
    allowPositionals: true
  });
  const input = positionals[0];
  if (input === undefined) {
    console.error(
      'usage: bun run scripts/map-citation-scans/index.ts <export.ged> [--data <folder>] [--dry-run]'
    );
    process.exit(2);
  }
  const root = resolve(values.data ?? 'data');
  const outFile = join(root, 'citation-scans.json');
  const checklistFile = join(root, 'citation-scans-checklist.md');

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

  const astia = openAstia(join(root, '.astia-cache'));
  // References read from a GEDCOM file, in no dataset: no Marks.
  const scans = openScanFolder(root, { astia }).scans(openDb(':memory:'));
  const resolutions = await Promise.all(refs.map((c) => scans.resolveRef(c)));
  const results = refs.map((c, i) => ({ ...c, ...resolutions[i] }));
  await Bun.write(outFile, `${JSON.stringify(results, null, 2)}\n`);
  await Bun.write(checklistFile, checklist(refs, resolutions));
  printTally(refs.map((c, i) => resolutionKey(c, resolutions[i]!)));
  console.log(`wrote ${outFile}\nwrote ${checklistFile}`);
}

await main();
