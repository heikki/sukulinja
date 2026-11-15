// A conversation's Proposal: the changes the assistant proposed, in order,
// each one of the app's own dataset operations with the request it takes
// and the reason given (ADR-0025), or a batch of them proposed as one item
// (ADR-0028). Nothing is written when one is proposed. Applying runs the
// ticked ones, one by one, through `run`, the app's handlers; one refused
// (the dataset changed, a rule says no) or failing is told, and the rest
// go on.

import { OPERATIONS } from '@/common/operations';
import type { OperationName } from '@/common/operations';
import type { Applied, ProposalItem } from '@/common/types';

import { Refusal } from '../operations';
import type { Asked, LaterStep } from './operations/operation';

// Applying more changes than this at once copies the dataset first.
export const LARGE = 10;

// How many of a batch's changes its item names as examples.
const EXAMPLES = 3;

// One change of an item: an operation on its input, as its own `read`
// gave it, then any steps needing its answer.
interface Part {
  operation: OperationName;
  input: unknown;
  then: LaterStep[];
}

interface Proposed {
  item: ProposalItem;
  parts: Part[];
  done: 'applied' | 'withdrawn' | null;
}

// Runs one of the app's operations on its input, as its route would: what
// it answers.
export type RunOperation = (
  operation: OperationName,
  input: unknown
) => Promise<unknown>;

// The request read as the operation's route reads one, or why it can't be.
function partOf(asked: Asked): Part | { rejected: string } {
  const op = OPERATIONS[asked.operation];
  const input: unknown = op.read(asked.body);
  if (input === null || op.answer !== 'json') {
    return { rejected: `The app's ${asked.operation} expects ${op.expects}.` };
  }
  return { operation: asked.operation, input, then: asked.then ?? [] };
}

function refusalWords(e: unknown) {
  return e instanceof Refusal
    ? e.message
    : `The app failed: ${e instanceof Error ? e.message : String(e)}`;
}

// Runs the part, then its steps, each on what the one before answered.
async function runPart(part: Part, run: RunOperation) {
  let answer = await run(part.operation, part.input);
  for (const step of part.then) {
    const op = OPERATIONS[step.operation];
    const input: unknown = op.read(step.bodyAfter(answer));
    if (input === null) {
      throw new Refusal(400, `The app's ${step.operation} couldn't follow.`);
    }
    // eslint-disable-next-line no-await-in-loop -- each step needs the answer before it
    answer = await run(step.operation, input);
  }
}

// What applying an item's parts said: null when all went, else how many
// didn't and why the first didn't.
function outcomeOf(failed: string[], parts: number) {
  if (failed.length === 0) return null;
  if (parts === 1) return failed[0]!;
  return `${failed.length} of ${parts} not applied: ${failed[0]!}`;
}

export function openProposal() {
  const items: Proposed[] = [];
  // What became of items since the assistant was last told, for it to know
  // on the next question.
  let untold: string[] = [];

  function open(id: number) {
    const found = items.find((p) => p.item.id === id);
    return found?.done === null ? found : null;
  }

  // Adds the changes as one item, labelled `label`, with a few of them
  // named for a batch: the item, or why one can't be proposed.
  function proposeAll(
    asks: Asked[],
    label: string,
    reason: string
  ): ProposalItem | { rejected: string } {
    const parts: Part[] = [];
    for (const asked of asks) {
      const part = partOf(asked);
      if ('rejected' in part) return part;
      parts.push(part);
    }
    const examples =
      asks.length === 1 ? [] : asks.slice(0, EXAMPLES).map((a) => a.label);
    const item = { id: items.length + 1, label, reason, examples };
    items.push({ item, parts, done: null });
    return item;
  }

  async function applyItem(p: Proposed, run: RunOperation) {
    const failed: string[] = [];
    for (const part of p.parts) {
      try {
        // eslint-disable-next-line no-await-in-loop -- in order, each on the dataset the one before left
        await runPart(part, run);
      } catch (e) {
        failed.push(refusalWords(e));
      }
    }
    const refused = outcomeOf(failed, p.parts.length);
    untold.push(
      refused === null
        ? `#${p.item.id} applied`
        : `#${p.item.id} refused by the app: ${refused}`
    );
    return {
      outcome: { id: p.item.id, refused },
      someWent: failed.length < p.parts.length
    };
  }

  return {
    // Adds the item, its request read as the operation's route reads one:
    // the item, or why it can't be proposed.
    propose(asked: Asked, reason: string) {
      return proposeAll([asked], asked.label, reason);
    },

    // Adds the changes as one item, as `propose` does each.
    proposeAll,

    // Takes an item not yet applied out; whether there was one.
    withdraw(id: number) {
      const found = open(id);
      if (found === null) return false;
      found.done = 'withdrawn';
      return true;
    },

    // Whether applying these takes a copy of the dataset first: they make
    // more than LARGE changes.
    isLarge(ids: number[]) {
      const parts = ids.reduce((n, id) => n + (open(id)?.parts.length ?? 0), 0);
      return parts > LARGE;
    },

    // Runs the open items among `ids`, in the Proposal's order. An item of
    // which any change went is applied; the rest of its changes say why
    // they didn't.
    async apply(
      ids: number[],
      run: RunOperation
    ): Promise<Applied['outcomes']> {
      const wanted = new Set(ids);
      const outcomes: Applied['outcomes'] = [...wanted]
        .filter((id) => open(id) === null)
        .map((id) => ({ id, refused: 'Not in the Proposal.' }));
      for (const p of items) {
        if (!wanted.has(p.item.id) || p.done !== null) continue;
        // eslint-disable-next-line no-await-in-loop -- in order, each on the dataset the one before left
        const { outcome, someWent } = await applyItem(p, run);
        if (someWent) p.done = 'applied';
        outcomes.push(outcome);
      }
      return outcomes.sort((a, b) => a.id - b.id);
    },

    // What became of items since last asked, once; null for nothing.
    news() {
      if (untold.length === 0) return null;
      const told = `The user applied items of the Proposal: ${untold.join('; ')}.`;
      untold = [];
      return told;
    }
  };
}

export type Proposal = ReturnType<typeof openProposal>;
