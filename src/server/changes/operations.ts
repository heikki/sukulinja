// The operations on a dataset's Changes (common/operations/changes).

import type { CHANGE_OPERATIONS } from '@/common/operations/changes';

import type { Handlers } from '../operations';
import type { Changes } from './changes';

export function changeOperations(
  changes: Changes
): Handlers<typeof CHANGE_OPERATIONS> {
  return {
    changes: async () => await changes.list(),
    clearChanges() {
      changes.clear();
    }
  };
}
