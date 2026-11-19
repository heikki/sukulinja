// The operations that find church books for a person (common/operations/
// books): their Facts and Citations, from the tree, against the parishes'
// Volumes, from the Citations.

import type { BOOK_OPERATIONS } from '@/common/operations/books';

import { askingAstia } from './citations';
import type { DatasetServices } from './datasets/services';
import { answered } from './operations';
import type { Handlers } from './operations';

export function bookOperations({
  personDetails,
  scans
}: DatasetServices): Handlers<typeof BOOK_OPERATIONS> {
  return {
    async personBooks({ personId }) {
      const { facts, citations } = answered(personDetails(personId), 'person');
      return await askingAstia(scans.booksFor({ facts, citations }));
    }
  };
}
