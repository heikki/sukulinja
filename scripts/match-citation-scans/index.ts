// The vision pass: match a dataset's church-book citations to their exact
// Astia Images with Claude, and save the confirmed ones as Record pins or
// Reference pins in the data folder, where the app reads them.
//
//   bun run scripts/match-citation-scans/index.ts --dataset <slug>
//     [--data <folder>] [--books rippikirjat|index] [--parish <name>]
//     [--volume <Astia id>] [--limit <n>] [--dry-run]
//     [--pages-model <m>] [--dates-model <m>] [--entry-model <m>]
//
// Unattended and resumable: every reading is cached under
// <data>/.vision-readings, and references already pinned are skipped, so a
// re-run after a crash or Ctrl-C picks up where it stopped. It writes
// nothing (a dry run aside) until scripts/evaluate-reader has shown the
// find-entry model confirms at most 1% of decoys. References it couldn't
// confirm go to <data>/citation-scans-review.md. Credentials come from
// ANTHROPIC_API_KEY or an `ant auth login` profile.

import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@server/citation-scans/astia';
import { openScanCache } from '@server/citation-scans/scan-cache';

import { claudeReader } from '../vision/claude-reader';
import type { Spend } from '../vision/claude-reader';
import { datasetRefs } from '../vision/dataset';
import { pacedImages } from '../vision/images';
import { reviewMarkdown, runMatching } from './run';
import type { Books } from './run';

const USAGE =
  'usage: bun run scripts/match-citation-scans/index.ts --dataset <slug> [--data <folder>] [--books rippikirjat|index] [--parish <name>] [--volume <id>] [--limit <n>] [--dry-run] [--pages-model <m>] [--dates-model <m>] [--entry-model <m>]';

function printTally(keys: string[]) {
  const tally = new Map<string, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  const sorted = [...tally].sort(([a], [b]) => a.localeCompare(b));
  for (const [k, n] of sorted) console.log(`${String(n).padStart(6)}  ${k}`);
}

function spentSoFar(spend: Record<string, Spend>) {
  const all = Object.values(spend);
  return all.some((s) => s.dollars === null)
    ? null
    : all.reduce((sum, s) => sum + s.dollars!, 0);
}

// The options given, without the ones left out.
function given<T extends Record<string, unknown>>(options: T) {
  return Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

function isBooks(value: string): value is Books {
  return value === 'rippikirjat' || value === 'index';
}

function booksOption(value: string | undefined) {
  if (value === undefined) return undefined;
  if (isBooks(value)) return value;
  console.error(USAGE);
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'data': { type: 'string' },
      'dataset': { type: 'string' },
      'books': { type: 'string' },
      'parish': { type: 'string' },
      'volume': { type: 'string' },
      'limit': { type: 'string' },
      'dry-run': { type: 'boolean' },
      'pages-model': { type: 'string' },
      'dates-model': { type: 'string' },
      'entry-model': { type: 'string' }
    }
  });
  if (values.dataset === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  const books = booksOption(values.books);
  const root = resolve(values.data ?? 'data');
  const dryRun = values['dry-run'] === true;
  const refs = datasetRefs(join(root, values.dataset, 'db.sqlite'));
  console.log(`${refs.length} church-book references`);

  const astia = openAstia(join(root, '.astia-cache'));
  const claude = claudeReader({
    image: pacedImages(openScanCache({ astia, root, switches: true })),
    models: given({
      pages: values['pages-model'],
      dates: values['dates-model'],
      entry: values['entry-model']
    })
  });
  const result = await runMatching({
    root,
    refs,
    reader: claude,
    astia,
    dryRun,
    ...given({
      books,
      parish: values.parish,
      volume: values.volume,
      limit: values.limit === undefined ? undefined : Number(values.limit)
    }),
    spent: () => spentSoFar(claude.spend())
  });
  if ('refused' in result) {
    console.error(
      `Not writing: ${result.refused}.\nRun scripts/evaluate-reader first, or pass --dry-run.`
    );
    process.exit(1);
  }

  console.log('');
  printTally(result.outcomes);
  const spent = spentSoFar(claude.spend());
  console.log(
    `${dryRun ? 'would save' : 'saved'} ${result.saved}; ${result.review.length} to review; spent ${spent === null ? '?' : `$${spent.toFixed(2)}`}`
  );
  if (!dryRun) {
    const file = join(root, 'citation-scans-review.md');
    await Bun.write(file, reviewMarkdown(result.review));
    console.log(`wrote ${file}`);
  }
}

await main();
