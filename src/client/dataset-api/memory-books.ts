// The memory fake's Book list (memory.ts): the list given, which
// `listBook` adds one of the `listable` to, as added, and `unlistBook`
// takes one added and uncited off.

import type { ListedBook } from '@/common/types';

import { ApiError } from './ask';
import type { DatasetApi } from './index';

type Answer = <T>(
  what: string,
  signal: AbortSignal | undefined,
  give: () => T
) => Promise<T>;

export function memoryBookList(
  data: { bookList?: ListedBook[]; listable?: ListedBook[] },
  answer: Answer
): Pick<DatasetApi, 'bookList' | 'listBook' | 'unlistBook'> {
  let list = [...(data.bookList ?? [])];
  return {
    bookList: async (signal) =>
      await answer('book list', signal, () => [...list]),

    listBook: async ({ volumeId }) =>
      await answer(`list book ${volumeId}`, undefined, () => {
        const book = data.listable?.find((b) => b.id === volumeId);
        if (book === undefined) throw new ApiError('No such book.');
        if (!list.some((b) => b.id === volumeId)) {
          list = [...list, { ...book, added: true }];
        }
        return [...list];
      }),

    unlistBook: async (volumeId) =>
      await answer(`unlist book ${volumeId}`, undefined, () => {
        const book = list.find((b) => b.id === volumeId);
        if (book === undefined || !book.added || book.cited > 0) {
          throw new ApiError('That book stays on the list.');
        }
        list = list.filter((b) => b.id !== volumeId);
        return [...list];
      })
  };
}
