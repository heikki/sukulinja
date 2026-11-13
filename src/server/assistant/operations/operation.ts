// One thing the assistant may ask of the dataset, described once: what
// Claude is told it does and takes, what the person using the app is shown
// while it runs, and the service call it makes. The tools Claude is given
// are made from these (catalogue.ts).

import type { TreeView } from '../tree-view';

// A JSON schema for an operation's input: an object of named fields.
export interface InputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
  [key: string]: unknown;
}

export interface ReadOperation<Input = Record<string, unknown>> {
  name: string;
  // For Claude: what it answers, and when to use it.
  description: string;
  input: InputSchema;
  // For the person: what it's doing, as it runs.
  label: (input: Input) => string;
  // Its answer, as JSON for Claude.
  run: (view: TreeView, input: Input) => unknown;
}

// An operation over any input, as the catalogue keeps them; each one's own
// input type is checked where it's written.
export type AnyReadOperation = ReadOperation<never>;

export function readOperation<Input>(op: ReadOperation<Input>) {
  return op as unknown as AnyReadOperation;
}
