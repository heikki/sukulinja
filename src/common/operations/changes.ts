// The operations on a dataset's Changes: listing them, and forgetting
// them all.

import type { Change } from '@/common/types';

import { asksNothing } from './operation';

export const CHANGE_OPERATIONS = {
  // Every Change made to the dataset, newest first.
  changes: asksNothing<Change[]>(),

  // Forgets every Change.
  clearChanges: asksNothing<undefined>()
};
