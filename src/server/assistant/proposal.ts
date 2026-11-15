// A conversation's Proposal: the changes the assistant proposed, in order,
// each one of the app's own dataset operations with the request it takes
// and the reason given (ADR-0025). Nothing is written when one is
// proposed. Applying runs the ticked ones, one by one, through `run`, the
// app's handlers; one refused (the dataset changed, a rule says no) or
// failing is told, and the rest go on.

import { OPERATIONS } from '@/common/operations';
import type { OperationName } from '@/common/operations';
import type { Applied, ProposalItem } from '@/common/types';

import { Refusal } from '../operations';
import type { Asked } from './operations/operation';

// Applying more items than this at once copies the dataset first.
export const LARGE = 10;

interface Proposed {
  item: ProposalItem;
  operation: OperationName;
  // The operation's input, as its own `read` gave it.
  input: unknown;
  done: 'applied' | 'withdrawn' | null;
}

// Runs one of the app's operations on its input, as its route would.
export type RunOperation = (
  operation: OperationName,
  input: unknown
) => Promise<unknown>;

export function openProposal() {
  const items: Proposed[] = [];
  // What became of items since the assistant was last told, for it to know
  // on the next question.
  let untold: string[] = [];

  function open(id: number) {
    const found = items.find((p) => p.item.id === id);
    return found?.done === null ? found : null;
  }

  return {
    // Adds the item, its request read as the operation's route reads one:
    // the item, or why it can't be proposed.
    propose(asked: Asked, reason: string): ProposalItem | { rejected: string } {
      const op = OPERATIONS[asked.operation];
      const input: unknown = op.read(asked.body);
      if (input === null || op.answer !== 'json') {
        return {
          rejected: `The app's ${asked.operation} expects ${op.expects}.`
        };
      }
      const item = { id: items.length + 1, label: asked.label, reason };
      items.push({ item, operation: asked.operation, input, done: null });
      return item;
    },

    // Takes an item not yet applied out; whether there was one.
    withdraw(id: number) {
      const found = open(id);
      if (found === null) return false;
      found.done = 'withdrawn';
      return true;
    },

    // Whether applying these takes a copy of the dataset first.
    isLarge(ids: number[]) {
      return ids.filter((id) => open(id) !== null).length > LARGE;
    },

    // Runs the open items among `ids`, in the Proposal's order.
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
        try {
          // eslint-disable-next-line no-await-in-loop -- in order, each on the dataset the one before left
          await run(p.operation, p.input);
          p.done = 'applied';
          outcomes.push({ id: p.item.id, refused: null });
          untold.push(`#${p.item.id} applied`);
        } catch (e) {
          const why =
            e instanceof Refusal
              ? e.message
              : `The app failed: ${e instanceof Error ? e.message : String(e)}`;
          outcomes.push({ id: p.item.id, refused: why });
          untold.push(`#${p.item.id} refused by the app: ${why}`);
        }
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
