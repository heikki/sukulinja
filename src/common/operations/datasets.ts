// The operations making a new dataset from this one: its people, some of
// them, copied as a dataset of their own.

import type { DatasetInfo } from '@/common/types';

import { answers } from './operation';
import { isId, isString } from './read';

export const DATASET_OPERATIONS = {
  // Copies the people, with all they hold, as a new dataset under the
  // name, this one left as it was: the new dataset as listed. They must be
  // one tree through the families among them.
  copyToNewDataset: answers<{ name: string; personIds: number[] }, DatasetInfo>(
    '{ name, personIds: [id] }',
    ({ name, personIds }) =>
      isString(name) &&
      Array.isArray(personIds) &&
      personIds.length > 0 &&
      personIds.every(isId)
        ? { name, personIds: [...new Set(personIds)] }
        : null
  )
};
