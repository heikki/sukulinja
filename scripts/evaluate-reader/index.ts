// How well each model reads, before trusting it with the data: asks the
// Reader about Images whose Page numbers, dates and records are known by
// hand (the shipped Anchors and Seen records, and index references placed
// in the app), and reports exact, wrong and
// unreadable rates and the cost per reading, per question and model.
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
import { Database } from 'bun:sqlite';

import { loadPlacements } from '@server/citation-scans/anchors';
import shipped from '@server/citation-scans/anchors.json';
import type { Anchors } from '@server/citation-scans/locate';
import { cachedReader } from '@server/citation-scans/reader';
import type { Question, Reader } from '@server/citation-scans/reader';
import {
  CHURCH_COLLECTIONS,
  parseChurchBookRef,
  RIPPI_COLLECTION
} from '@server/citation-scans/record';
import type { ChurchBookRef } from '@server/citation-scans/record';
import { useDataFolder } from '@server/citation-scans/scans';

import { claudeReader, DEFAULT_MODELS } from '../vision/claude-reader';
import type { Spend } from '../vision/claude-reader';
import { gateRefusal, loadEvaluation, recordEvaluation } from '../vision/gate';
import type { EntryTally, Evaluation, Tally } from '../vision/gate';
import {
  dateCases,
  entryCases,
  pageCases,
  scoreDates,
  scoreEntries,
  scorePages
} from './cases';

const USAGE =
  'usage: bun run scripts/evaluate-reader/index.ts --dataset <slug> [--data <folder>] [--limit <n>] [--pages-models <m,…>] [--dates-models <m,…>] [--entry-models <m,…>]';

// The dataset's Church-book references by record URL, and the principal of
// each rippikirja record by Record number.
function datasetRefs(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .query<{ page: string; text: string | null }, []>(
      `SELECT page, text FROM citations WHERE page LIKE '%myheritage%collection-%'`
    )
    .all();
  db.close();
  const refs = new Map<string, ChurchBookRef>();
  const names = new Map<number, string>();
  for (const row of rows) {
    const ref = parseChurchBookRef(row.page, row.text ?? '');
    if (!CHURCH_COLLECTIONS.has(ref.collection)) continue;
    refs.set(ref.url, ref);
    const principal = ref.collection === RIPPI_COLLECTION ? ref.name : null;
    if (ref.recordId !== null && principal !== null) {
      names.set(ref.recordId, principal);
    }
  }
  return { refs, names };
}

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

function row(question: Question, model: string, tally: Tally, cost: string) {
  const n = tally.questions;
  const decoys =
    'decoys' in tally
      ? `${(tally as EntryTally).falseConfirmations}/${(tally as EntryTally).decoys}`
      : '';
  return `| ${question} | ${model} | ${n} | ${percent(tally.exact, n)} | ${percent(tally.wrong, n)} | ${percent(tally.unreadable, n)} | ${decoys} | ${cost} |`;
}

async function evaluate(
  root: string,
  question: Question,
  model: string,
  score: (reader: Reader) => Promise<Tally>
) {
  const claude = claudeReader({ models: { [question]: model } });
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

async function runAll(root: string, runs: Run[]) {
  const results: Evaluation = {};
  const lines: string[] = [];
  let spentInAll: number | null = 0;
  // Nothing to ask leaves earlier results as they were.
  for (const run of runs.filter((r) => r.cases > 0)) {
    // eslint-disable-next-line no-await-in-loop -- one model at a time
    const result = await evaluate(root, run.question, run.model, run.score);
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
  useDataFolder(root);
  const limit = values.limit === undefined ? Infinity : Number(values.limit);
  const anchors = shipped as Anchors;

  const { refs, names } = datasetRefs(join(root, values.dataset, 'db.sqlite'));
  const pages = pageCases(anchors, limit);
  const dates = dateCases(await loadPlacements(), refs, limit);
  const entries = entryCases(anchors, names, limit);
  const decoys = entries.filter((c) => !c.there).length;
  console.log(
    `${pages.length} Page-number questions; ${dates.length} date questions; ${entries.length} find-entry questions (${decoys} decoys)`
  );

  const pageModels = models(values['pages-models'], DEFAULT_MODELS.pages);
  const dateModels = models(values['dates-models'], DEFAULT_MODELS.dates);
  const entryModels = models(values['entry-models'], DEFAULT_MODELS.entry);
  const { results, lines, spentInAll } = await runAll(root, [
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
      score: async (reader: Reader) => await scoreEntries(reader, entries)
    }))
  ]);
  await recordEvaluation(root, results);

  console.log(
    [
      '',
      '| Question | Model | Asked | Exact | Wrong | Unreadable | False confirmations | Per reading |',
      '|---|---|---|---|---|---|---|---|',
      ...lines,
      ''
    ].join('\n')
  );
  console.log(`spent this run: ${dollars(spentInAll, 2)}`);
  await printGate(root, entryModels);
  console.log(`recorded in ${join(root, 'vision-evaluation.json')}`);
}

await main();
