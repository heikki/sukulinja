// How well each model reads, before trusting it with the data: asks the
// Reader about Images whose Page numbers, dates and records are known by
// hand (the shipped Page pins, and Record and Reference pins marked in the
// app), and reports exact, wrong and unreadable rates and the cost
// per reading, per question and model; find-entry also for rippikirja and
// index references apart.
//
//   bun run scripts/evaluate-reader/index.ts --dataset <slug>
//     [--data <folder>] [--limit <n>]
//     [--pages-models <model,…>] [--dates-models <model,…>]
//     [--entry-models <model,…>]
//
// Names and dates come from the dataset's citations. Results are
// recorded in <data>/vision-evaluation.json, which the runner's gate reads;
// every reading is cached under <data>/.vision-readings, so a re-run only
// pays for what's new. Credentials come from ANTHROPIC_API_KEY or an
// `ant auth login` profile.

import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { openAstia } from '@/server/citation-scans/astia';
import { withoutStale } from '@/server/citation-scans/filming';
import { cachedReader } from '@/server/citation-scans/reader';
import type {
  ImageRef,
  Question,
  Reader
} from '@/server/citation-scans/reader';
import { openScanCache } from '@/server/citation-scans/scan-cache';
import { openScanFolder } from '@/server/citation-scans/scans';
import { openDb } from '@/server/db';

import { claudeReader, DEFAULT_MODELS } from '../vision/claude-reader';
import type { Spend } from '../vision/claude-reader';
import { datasetRefs, principals } from '../vision/dataset';
import { gateRefusal, loadEvaluation, recordEvaluation } from '../vision/gate';
import type { EntryTally, Evaluation, Tally } from '../vision/gate';
import { pacedImages } from '../vision/images';
import type { Scan } from '../vision/images';
import type { Confirmation } from './cases';
import {
  dateCases,
  entryCases,
  indexEntryCases,
  pageCases,
  scoreDates,
  scoreEntries,
  scorePages
} from './cases';

const USAGE =
  'usage: bun run scripts/evaluate-reader/index.ts --dataset <slug> [--data <folder>] [--limit <n>] [--pages-models <m,…>] [--dates-models <m,…>] [--entry-models <m,…>]';

function models(list: string | undefined, fallback: string) {
  return (list ?? fallback)
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m !== '');
}

function percent(n: number, of: number) {
  return of === 0 ? '–' : `${((n / of) * 100).toFixed(1)}%`;
}

function dollars(n: number | null, digits = 4) {
  return n === null ? '?' : `$${n.toFixed(digits)}`;
}

function totals(spend: Record<string, Spend>) {
  const all = Object.values(spend);
  const calls = all.reduce((sum, s) => sum + s.calls, 0);
  const spent = all.some((s) => s.dollars === null)
    ? null
    : all.reduce((sum, s) => sum + s.dollars!, 0);
  return { calls, spent };
}

function sum(a: EntryTally, b: EntryTally): EntryTally {
  return {
    questions: a.questions + b.questions,
    exact: a.exact + b.exact,
    wrong: a.wrong + b.wrong,
    unreadable: a.unreadable + b.unreadable,
    decoys: a.decoys + b.decoys,
    falseConfirmations: a.falseConfirmations + b.falseConfirmations
  };
}

function row(question: Question, model: string, tally: Tally, cost: string) {
  const n = tally.questions;
  const decoys =
    'decoys' in tally
      ? `${(tally as EntryTally).falseConfirmations}/${(tally as EntryTally).decoys}`
      : '';
  return `| ${question} | ${model} | ${n} | ${percent(tally.exact, n)} | ${percent(tally.wrong, n)} | ${percent(tally.unreadable, n)} | ${decoys} | ${cost} |`;
}

// The data folder evaluated in, and how Images are loaded.
interface Bench {
  root: string;
  image: (at: ImageRef) => Promise<Scan>;
}

async function evaluate(
  { root, image }: Bench,
  question: Question,
  model: string,
  score: (reader: Reader) => Promise<Tally>
) {
  const claude = claudeReader({ image, models: { [question]: model } });
  const reader = cachedReader(claude, join(root, '.vision-readings'));
  console.log(`${question} with ${model}…`);
  const tally = await score(reader);
  const { calls, spent } = totals(claude.spend());
  const earlier = (await loadEvaluation(root))[model]?.[question];
  // All cached: the cost per reading is the one measured when they were made.
  const dollarsPerReading =
    calls === 0
      ? (earlier?.dollarsPerReading ?? null)
      : spent === null
        ? null
        : spent / calls;
  return { tally, dollarsPerReading, calls, spent };
}

interface Run {
  question: Question;
  model: string;
  cases: number;
  score: (reader: Reader) => Promise<Tally>;
}

async function runAll(bench: Bench, runs: Run[]) {
  const results: Evaluation = {};
  const lines: string[] = [];
  let spentInAll: number | null = 0;
  // Nothing to ask leaves earlier results as they were.
  for (const run of runs.filter((r) => r.cases > 0)) {
    // eslint-disable-next-line no-await-in-loop -- one model at a time
    const result = await evaluate(bench, run.question, run.model, run.score);
    results[run.model] = {
      ...results[run.model],
      [run.question]: {
        tally: result.tally,
        dollarsPerReading: result.dollarsPerReading,
        evaluatedAt: new Date().toISOString()
      }
    };
    spentInAll =
      spentInAll === null || result.spent === null
        ? null
        : spentInAll + result.spent;
    const cost = dollars(result.dollarsPerReading, 5);
    lines.push(row(run.question, run.model, result.tally, cost));
  }
  return { results, lines, spentInAll };
}

// What requiring a confidence would trade: the people still confirmed,
// against the decoys still let through.
function printThresholds(
  model: string,
  found: Confirmation[],
  known: number,
  decoys: number
) {
  console.log(`\n${model}: confirmed at a minimum confidence`);
  console.log('| Minimum | People confirmed | Decoys confirmed |');
  console.log('|---|---|---|');
  for (const min of [0, 0.5, 0.7, 0.8, 0.9]) {
    const kept = found.filter((f) => f.confidence >= min);
    const people = kept.filter((f) => f.there).length;
    const wrong = kept.length - people;
    console.log(
      `| ${min} | ${people}/${known} (${percent(people, known)}) | ${wrong}/${decoys} (${percent(wrong, decoys)}) |`
    );
  }
}

async function printGate(root: string, entryModels: string[]) {
  for (const model of entryModels) {
    // eslint-disable-next-line no-await-in-loop -- a line per model
    const refusal = await gateRefusal(root, model);
    console.log(
      refusal === null
        ? `${model}: may save matches`
        : `${model}: may not save matches: ${refusal}`
    );
  }
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'data': { type: 'string' },
      'dataset': { type: 'string' },
      'limit': { type: 'string' },
      'pages-models': { type: 'string' },
      'dates-models': { type: 'string' },
      'entry-models': { type: 'string' }
    }
  });
  if (values.dataset === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  const root = resolve(values.data ?? 'data');
  const limit = values.limit === undefined ? Infinity : Number(values.limit);

  const dbPath = join(root, values.dataset, 'db.sqlite');
  const refs = datasetRefs(dbPath);
  const names = principals(refs);
  const astia = openAstia(join(root, '.astia-cache'));
  // Pins made on a filming Astia has since replaced name the wrong Image.
  const { volumes, references } = await withoutStale(
    await openScanFolder(root, { astia }).scans(openDb(dbPath)).snapshot(),
    astia
  );
  const pages = pageCases(volumes, limit);
  const byUrl = new Map(refs.map((r) => [r.url, r]));
  const dates = dateCases(references, byUrl, limit);
  const rippiEntries = entryCases(volumes, names, limit);
  const indexEntries = indexEntryCases(references, byUrl, limit);
  const entries = [...rippiEntries, ...indexEntries];
  const decoys = entries.filter((c) => !c.there).length;
  console.log(
    `${pages.length} Page-number questions; ${dates.length} date questions; ${entries.length} find-entry questions (${indexEntries.length} on index references; ${decoys} decoys)`
  );

  const thresholds: Array<() => void> = [];
  const apart: string[] = [];
  const pageModels = models(values['pages-models'], DEFAULT_MODELS.pages);
  const dateModels = models(values['dates-models'], DEFAULT_MODELS.dates);
  const entryModels = models(values['entry-models'], DEFAULT_MODELS.entry);
  const image = pacedImages(openScanCache({ astia, root, switches: true }));
  const { results, lines, spentInAll } = await runAll({ root, image }, [
    ...pageModels.map((model) => ({
      question: 'pages' as const,
      model,
      cases: pages.length,
      score: async (reader: Reader) => await scorePages(reader, pages)
    })),
    ...dateModels.map((model) => ({
      question: 'dates' as const,
      model,
      cases: dates.length,
      score: async (reader: Reader) => await scoreDates(reader, dates)
    })),
    ...entryModels.map((model) => ({
      question: 'entry' as const,
      model,
      cases: entries.length,
      score: async (reader: Reader) => {
        const found: Confirmation[] = [];
        const rippi = await scoreEntries(reader, rippiEntries, found);
        const index = await scoreEntries(reader, indexEntries, found);
        apart.push(
          row('entry', `${model}, rippikirjat`, rippi, ''),
          row('entry', `${model}, index`, index, '')
        );
        const tally = sum(rippi, index);
        thresholds.push(() => {
          printThresholds(model, found, entries.length - decoys, decoys);
        });
        return tally;
      }
    }))
  ]);
  await recordEvaluation(root, results);

  console.log(
    [
      '',
      '| Question | Model | Asked | Exact | Wrong | Unreadable | False confirmations | Per reading |',
      '|---|---|---|---|---|---|---|---|',
      ...lines,
      ...apart,
      ''
    ].join('\n')
  );
  console.log(`spent this run: ${dollars(spentInAll, 2)}`);
  for (const print of thresholds) print();
  console.log('');
  await printGate(root, entryModels);
  console.log(`recorded in ${join(root, 'vision-evaluation.json')}`);
}

await main();
