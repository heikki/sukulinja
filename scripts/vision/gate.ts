// What the evaluation found, kept in the data folder: per model and
// question, how often the Reader read right. The runner writes nothing until
// the model it confirms matches with has shown it almost never confirms a
// person who isn't there.

import { join } from 'node:path';

import type { Question } from '@/server/citation-scans/reader';

export interface Tally {
  questions: number;
  exact: number;
  wrong: number;
  unreadable: number;
}

export interface EntryTally extends Tally {
  // Asked about a name from elsewhere in the Volume, and how often the
  // Reader said it was there.
  decoys: number;
  falseConfirmations: number;
}

export interface QuestionResult {
  tally: Tally | EntryTally;
  // What the readings cost, per reading made in that run; null if unknown.
  dollarsPerReading: number | null;
  evaluatedAt: string;
}

export type Evaluation = Record<
  string,
  Partial<Record<Question, QuestionResult>>
>;

export const MAX_FALSE_CONFIRMATIONS = 0.01;
// Fewer decoys than this can't show a rate of 1% or less.
export const MIN_DECOYS = 100;

function evaluationFile(root: string) {
  return join(root, 'vision-evaluation.json');
}

export async function loadEvaluation(root: string) {
  const file = Bun.file(evaluationFile(root));
  return (await file.exists()) ? ((await file.json()) as Evaluation) : {};
}

// Results replace earlier ones for the same model and question only.
export async function recordEvaluation(root: string, results: Evaluation) {
  const evaluation = await loadEvaluation(root);
  for (const [model, questions] of Object.entries(results)) {
    evaluation[model] = { ...evaluation[model], ...questions };
  }
  await Bun.write(
    evaluationFile(root),
    `${JSON.stringify(evaluation, null, 2)}\n`
  );
}

export function falseConfirmationRate(tally: EntryTally) {
  return tally.decoys === 0 ? null : tally.falseConfirmations / tally.decoys;
}

// Why the runner may not write with this find-entry model, or null if it
// may.
export async function gateRefusal(root: string, model: string) {
  const tally = (await loadEvaluation(root))[model]?.entry?.tally as
    EntryTally | undefined;
  if (tally === undefined) {
    return `${model} hasn't been evaluated on finding entries`;
  }
  if (tally.decoys < MIN_DECOYS) {
    return `${model} was evaluated on ${tally.decoys} decoys; at least ${MIN_DECOYS} are needed`;
  }
  const rate = falseConfirmationRate(tally)!;
  return rate > MAX_FALSE_CONFIRMATIONS
    ? `${model} confirmed ${(rate * 100).toFixed(1)}% of decoys; at most ${MAX_FALSE_CONFIRMATIONS * 100}% is allowed`
    : null;
}
