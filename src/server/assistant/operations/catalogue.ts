// Every operation the assistant may use, and the tools Claude is given
// for them. Adding an operation to the assistant is one entry here.

import type Anthropic from '@anthropic-ai/sdk';

import { supportFact } from './citations';
import { addFact, editFact } from './facts';
import { changes, remind, reminders } from './notes';
import type {
  AnyReadOperation,
  AnyWriteOperation,
  InputSchema
} from './operation';
import { findPersons, movePerson, person, renamePerson } from './persons';
import { placeFacts, places } from './places';

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
  remind
];

// Taking back an item of the Proposal not yet applied: the conversation's
// own, not the app's.
export const WITHDRAW = 'withdraw_proposal_item';

export function operationNamed(name: string) {
  return READ_OPERATIONS.find((op) => op.name === name) ?? null;
}

export function writeNamed(name: string) {
  return WRITE_OPERATIONS.find((op) => op.name === name) ?? null;
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
// the reads, the writes, then taking one back.
export function toolsOf(
  reads: readonly AnyReadOperation[],
  writes: readonly AnyWriteOperation[] = []
): Anthropic.Beta.BetaTool[] {
  return [
    ...reads.map((op) => ({
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
    ...(writes.length === 0 ? [] : [WITHDRAW_TOOL])
  ];
}
