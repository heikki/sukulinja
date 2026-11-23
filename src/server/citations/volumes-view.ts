// The Volumes view as one answer: the dataset's Book list, then every
// other Volume with something on this computer, each with its page numbers
// and the steps its buttons offer, and Storage's fill.

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
  { onList, added, cited }: Pick<VolumesRow, 'onList' | 'added' | 'cited'>
): VolumesRow['steps'] {
  const unlist = onList && added && cited === 0 && onDisk.bytes === 0;
  return {
    download: next.download,
    trash: next.trash ?? (unlist ? 'unlist' : null)
  };
}

async function rowOf(
  book: HereBook,
  of: Pick<VolumesRow, 'onList' | 'added' | 'cited'>,
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

export async function volumesView({
  listed,
  here,
  pagesOf,
  storage
}: Sources): Promise<VolumesView> {
  const [list, others, status] = await Promise.all([
    listedOrNot(listed),
    here(),
    storage()
  ]);
  const onList = new Set((list ?? []).map((b) => b.id));
  const rows = await Promise.all([
    ...(list ?? []).map(
      async ({ cited, added, ...b }) =>
        await rowOf(b, { onList: true, added, cited }, pagesOf)
    ),
    ...others
      .filter((b) => !onList.has(b.id))
      .map(
        async (b) =>
          await rowOf(b, { onList: false, added: false, cited: 0 }, pagesOf)
      )
  ]);
  return { rows, listed: list !== null, storage: status };
}
