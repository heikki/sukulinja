// Every operation the assistant may use, and the tools Claude is given
// for them. Adding an operation to the assistant is one entry here.

import type Anthropic from '@anthropic-ai/sdk';

import { changes, reminders } from './notes';
import type { AnyReadOperation } from './operation';
import { findPersons, person } from './persons';
import { placeFacts, places } from './places';

export const READ_OPERATIONS: readonly AnyReadOperation[] = [
  findPersons,
  person,
  places,
  placeFacts,
  reminders,
  changes
];

export function operationNamed(name: string) {
  return READ_OPERATIONS.find((op) => op.name === name) ?? null;
}

// The tools, in a fixed order, so the request's prefix stays cacheable.
export function toolsOf(
  operations: readonly AnyReadOperation[]
): Anthropic.Beta.BetaTool[] {
  return operations.map((op) => ({
    name: op.name,
    description: op.description,
    input_schema: op.input,
    strict: true
  }));
}
