// One thing the assistant may ask of the dataset, described once: what
// Claude is told it does and takes, what the person using the app is shown,
// and what it does. A read operation answers at once; a write operation
// only proposes one of the app's own dataset operations, which runs when
// the person applies it (ADR-0025); a show operation moves what the
// person sees, changing no data. The tools Claude is given are made
// from these (catalogue.ts).

import type { OperationName } from '@/common/operations';
import type { ShowOn } from '@/common/types';

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

// What a write operation proposes: one of the app's dataset operations, by
// name, with the request body it takes, as a form would send it; and what
// it would do, in words for the person.
export interface Asked {
  operation: OperationName;
  body: Record<string, unknown>;
  label: string;
}

export interface WriteOperation<Input = Record<string, unknown>> {
  name: string;
  // For Claude: what it would change, and when to use it.
  description: string;
  // Its own fields; the `reason` every write takes is added to them.
  input: InputSchema;
  // The app's operation it proposes, or why it can't be proposed: someone
  // left out, or what it names isn't there.
  asks: (view: TreeView, input: Input) => Asked | { rejected: string };
}

// Operations over any input, as the catalogue keeps them; each one's own
// input type is checked where it's written.
export type AnyReadOperation = ReadOperation<never>;
export type AnyWriteOperation = WriteOperation<never>;

export function readOperation<Input>(op: ReadOperation<Input>) {
  return op as unknown as AnyReadOperation;
}

export function writeOperation<Input>(op: WriteOperation<Input>) {
  return op as unknown as AnyWriteOperation;
}

// Where a show operation moves the view, and what's said of it under the
// answer.
export interface Shown {
  on: ShowOn;
  label: string;
}

export interface ShowOperation<Input = Record<string, unknown>> {
  name: string;
  // For Claude: what it shows, and when to use it.
  description: string;
  input: InputSchema;
  // Where it moves the view, or why it can't: what it names isn't there,
  // or is someone left out.
  shows: (view: TreeView, input: Input) => Shown | { rejected: string };
}

export type AnyShowOperation = ShowOperation<never>;

export function showOperation<Input>(op: ShowOperation<Input>) {
  return op as unknown as AnyShowOperation;
}
