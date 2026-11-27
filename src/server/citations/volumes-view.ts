// The Volumes view as one answer: the dataset's Book list, then every
// other dataset's, then every other Volume with something on this
// computer, each with how many of the dataset's Citations and of every
// dataset's link into it, its page numbers and the steps its buttons
// offer, and Storage's fill.

import type {
  ChurchBookVolume,
  ListedBook,
  PageNumbering,
  StorageStatus,
  VolumesRow,
  VolumesView
} from '@/common/types';

import { AstiaError } from './astia/astia';
import type { HereBook } from './astia/church-books';

interface Sources {
  // The dataset's Book list; throws AstiaError when Astia can't say.
  listed: () => Promise<ListedBook[]>;
  // Every other dataset's Book list; one Astia can't say is left out, and
  // all of them when Astia can't say this one's.
  elsewhere: () => Promise<ListedBook[][]>;
  // Every Volume with something on this computer.
  here: () => Promise<HereBook[]>;
  // What's known of a Volume's page numbers.
  pagesOf: (volumeId: string) => Promise<PageNumbering>;
  storage: () => Promise<StorageStatus>;
}

// Its buttons' steps: Storage's, and with Storage's trash step none and
// nothing of it here, one added by hand that nothing cites taken off the
// Book list.
function stepsOf(
  { next, onDisk }: ChurchBookVolume,
  { onList, added, cited }: Of
): VolumesRow['steps'] {
  const unlist = onList && added && cited === 0 && onDisk.bytes === 0;
  return {
    move: next.move,
    trash: next.trash ?? (unlist ? 'unlist' : null)
  };
}

type Of = Pick<VolumesRow, 'onList' | 'added' | 'cited' | 'citedAll'>;

async function rowOf(
  book: HereBook,
  of: Of,
  pagesOf: Sources['pagesOf']
): Promise<VolumesRow> {
  const { next: _, ...rest } = book;
  return {
    ...rest,
    ...of,
    pages: await pagesOf(book.id),
    steps: stepsOf(book, of)
  };
}

// The Book list, or null when Astia can't say what's on it.
async function listedOrNot(listed: Sources['listed']) {
  try {
    return await listed();
  } catch (err) {
    if (err instanceof AstiaError) return null;
    throw err;
  }
}

// How many of every dataset's Citations link into each Volume, by its id.
function countsOf(lists: ListedBook[][]) {
  const counts = new Map<string, number>();
  for (const b of lists.flat()) {
    counts.set(b.id, (counts.get(b.id) ?? 0) + b.cited);
  }
  return counts;
}

export async function volumesView({
  listed,
  elsewhere,
  here,
  pagesOf,
  storage
}: Sources): Promise<VolumesView> {
  const [list, theirs, others, status] = await Promise.all([
    listedOrNot(listed),
    elsewhere(),
    here(),
    storage()
  ]);
  const own = list ?? [];
  // With this one's list not told, the others' would count it short.
  const lists = list === null ? [] : theirs;
  const counts = countsOf([own, ...lists]);
  function citedAll(id: string) {
    return counts.get(id) ?? 0;
  }
  const seen = new Set(own.map((b) => b.id));
  // Each Volume once: on another Book list, or only on this computer.
  const listedThere: HereBook[] = lists
    .flat()
    .map(({ cited: _, added: __, ...b }) => b);
  const rest = [...listedThere, ...others].filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
  const rows = await Promise.all([
    ...own.map(
      async ({ cited, added, ...b }) =>
        await rowOf(
          b,
          { onList: true, added, cited, citedAll: citedAll(b.id) },
          pagesOf
        )
    ),
    ...rest.map(
      async (b) =>
        await rowOf(
          b,
          { onList: false, added: false, cited: 0, citedAll: citedAll(b.id) },
          pagesOf
        )
    )
  ]);
  return { rows, listed: list !== null, storage: status };
}
