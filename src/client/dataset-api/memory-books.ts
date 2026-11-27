// The memory fake's Book list (memory.ts): the list given, which
// `listBook` adds one of the `listable` to, as added, and `unlistBook`
// takes one added and uncited off. Its Volumes view is the list alone,
// counted, with Storage's steps as given and empty: the server decides
// the rest.

import type { ListedBook, VolumesView } from '@/common/types';

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
): Pick<DatasetApi, 'bookList' | 'listBook' | 'unlistBook' | 'volumesView'> {
  let list = [...(data.bookList ?? [])];
  return {
    bookList: async (signal) =>
      await answer('book list', signal, () => [...list]),

    volumesView: async (signal) =>
      await answer('volumes', signal, (): VolumesView => ({
        rows: list.map(({ next, ...b }) => ({
          ...b,
          onList: true,
          citedAll: b.cited,
          pages: 'counted',
          steps: next
        })),
        listed: true,
        storage: { cap: 0, used: 0, kept: 0, caps: [] }
      })),

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
