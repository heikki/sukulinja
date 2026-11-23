// The operations on a dataset's church books as a whole (common/
// operations/books): its Book list, from the Citations, and the Volumes a
// person should be in, their Facts and Citations from the tree against
// the parishes' Volumes.

import type { BOOK_OPERATIONS } from '@/common/operations/books';

import { askingAstia } from './citations';
import type { DatasetServices } from './datasets/services';
import { answered } from './operations';
import type { Handlers } from './operations';

export function bookOperations({
  personDetails,
  scans
}: DatasetServices): Handlers<typeof BOOK_OPERATIONS> {
  const { bookList } = scans;
  async function listed() {
    return await askingAstia(bookList.all());
  }
  return {
    bookList: listed,

    volumesView: async () => await scans.volumesView(),

    async listBook({ volumeId, archiveId }) {
      await askingAstia(bookList.add(volumeId, archiveId));
      return await listed();
    },

    async unlistBook({ volumeId }) {
      await askingAstia(bookList.remove(volumeId));
      return await listed();
    },

    async personBooks({ personId }) {
      const { facts, citations } = answered(personDetails(personId), 'person');
      return await askingAstia(scans.booksFor({ facts, citations }));
    }
  };
}
