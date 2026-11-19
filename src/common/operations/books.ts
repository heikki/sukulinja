// The operations that find church books for a person: the Volumes their
// Facts say they should be in.

import type { BookSuggestion } from '@/common/types';

import { answers } from './operation';
import { isId } from './read';

export const BOOK_OPERATIONS = {
  // A person's Expected entries in the order of their life, each with the
  // parishes it was looked for in and the Volumes it fits.
  personBooks: answers<{ personId: number }, BookSuggestion[]>(
    '{ personId }',
    ({ personId }) => (isId(personId) ? { personId } : null)
  )
};
