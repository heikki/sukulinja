// Every operation on a dataset (operation.ts), by its name.

import { ASSISTANT_OPERATIONS } from './assistant';
import { CHANGE_OPERATIONS } from './changes';
import { CITATION_OPERATIONS } from './citations';
import { FACT_OPERATIONS } from './facts';
import { PHOTO_OPERATIONS } from './photos';
import { REMINDER_OPERATIONS } from './reminders';
import { TREE_OPERATIONS } from './tree';

export const OPERATIONS = {
  ...TREE_OPERATIONS,
  ...FACT_OPERATIONS,
  ...CITATION_OPERATIONS,
  ...PHOTO_OPERATIONS,
  ...REMINDER_OPERATIONS,
  ...CHANGE_OPERATIONS,
  ...ASSISTANT_OPERATIONS
};

export type Operations = typeof OPERATIONS;
export type OperationName = keyof Operations;

export type { BoxAt, MarkTarget } from './citations';
export type {
  EntryAsked,
  EntryAt,
  EntryEdit,
  EntryTarget,
  InEntry,
  Newcomer
} from './entries';
export { APP_OPERATIONS } from './app';
export type { AppOperations } from './app';
export type { AnyOperation, InputOf, OutputOf } from './operation';
