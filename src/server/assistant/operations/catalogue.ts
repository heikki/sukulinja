// Every operation the assistant may use, and the tools Claude is given
// for them. Adding an operation to the assistant is one entry here.

import type Anthropic from '@anthropic-ai/sdk';

import { supportFact } from './citations';
import { copyToNewDataset } from './datasets';
import { addFact, editFact } from './facts';
import { changes, remind, reminders } from './notes';
import type {
  AnyReadOperation,
  AnyShowOperation,
  AnyWriteOperation,
  InputSchema
} from './operation';
import { findPersons, movePerson, person, renamePerson } from './persons';
import { placeFacts, places } from './places';
import { openSource, selectPerson } from './show';

export const READ_OPERATIONS: readonly AnyReadOperation[] = [
  findPersons,
  person,
  places,
  placeFacts,
  reminders,
  changes
];

export const WRITE_OPERATIONS: readonly AnyWriteOperation[] = [
  addFact,
  editFact,
  supportFact,
  renamePerson,
  movePerson,
  remind,
  copyToNewDataset
];

export const SHOW_OPERATIONS: readonly AnyShowOperation[] = [
  selectPerson,
  openSource
];

// Taking back an item of the Proposal not yet applied: the conversation's
// own, not the app's.
export const WITHDRAW = 'withdraw_proposal_item';

// A write's batch tool: its name for proposing many as one item.
const MANY = '_many';

// The write whose batch tool this is, or null.
export function batchOf(name: string) {
  if (!name.endsWith(MANY)) return null;
  const op = writeNamed(name.slice(0, -MANY.length));
  return op?.many === undefined ? null : op;
}

// Most changes one batch may hold, so one answer's tool input stays a
// size Claude writes reliably.
export const MAX_BATCH = 200;

export function operationNamed(name: string) {
  return READ_OPERATIONS.find((op) => op.name === name) ?? null;
}

export function writeNamed(name: string) {
  return WRITE_OPERATIONS.find((op) => op.name === name) ?? null;
}

export function showNamed(name: string) {
  return SHOW_OPERATIONS.find((op) => op.name === name) ?? null;
}

// A write's own fields, and the reason the user is shown with it.
function withReason(input: InputSchema): InputSchema {
  return {
    ...input,
    properties: {
      ...input.properties,
      reason: {
        type: 'string',
        description:
          'Why, in a sentence for the user, in their language: what in the tree or its sources says so.'
      }
    },
    required: [...input.required, 'reason']
  };
}

// The batch tool of a write that has one: many of its inputs, and one
// reason for them all. Not strict: an array of a write's whole input makes
// a grammar the API refuses as too large, so its input is checked when
// it's run (fits.ts).
function batchTool(op: AnyWriteOperation): Anthropic.Beta.BetaTool {
  return {
    name: `${op.name}${MANY}`,
    input_schema: batchSchema(op),
    description: `Proposes many ${op.name} changes as one item of the Proposal, for changes across many people (at most ${MAX_BATCH}): the user sees how many and a few of them, and applies them at once. Each one is checked as ${op.name} checks it; those that can't be proposed are left out and told.`
  };
}

// A batch tool's input: many of the write's, and one reason.
export function batchSchema(op: AnyWriteOperation) {
  return withReason({
    type: 'object',
    properties: {
      changes: { type: 'array', items: op.input }
    },
    required: ['changes'],
    additionalProperties: false
  });
}

const WITHDRAW_TOOL: Anthropic.Beta.BetaTool = {
  name: WITHDRAW,
  description:
    'Takes an item you proposed back out of the Proposal, by its number, when the user asks or it turns out wrong. One already applied stays done.',
  input_schema: {
    type: 'object',
    properties: { item: { type: 'integer' } },
    required: ['item'],
    additionalProperties: false
  },
  strict: true
};

// The tools, in a fixed order, so the request's prefix stays cacheable:
// the reads, the shows, the writes and their batch tools, then taking one
// back.
export function toolsOf(
  reads: readonly AnyReadOperation[],
  writes: readonly AnyWriteOperation[] = [],
  shows: readonly AnyShowOperation[] = []
): Anthropic.Beta.BetaTool[] {
  return [
    ...[...reads, ...shows].map((op) => ({
      name: op.name,
      description: op.description,
      input_schema: op.input,
      strict: true
    })),
    ...writes.map((op) => ({
      name: op.name,
      description: op.description,
      input_schema: withReason(op.input),
      strict: true
    })),
    ...writes.filter((op) => op.many !== undefined).map(batchTool),
    ...(writes.length === 0 ? [] : [WITHDRAW_TOOL])
  ];
}
