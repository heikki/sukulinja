// The operations on a dataset's church books as a whole: its Book list,
// adding Volumes to it and taking them off, the Volumes view, and the
// Volumes a person's Facts say they should be in.

import type { BookSuggestion, ListedBook, VolumesView } from '@/common/types';

import { answers, asksNothing } from './operation';
import { isId, isName } from './read';

export const BOOK_OPERATIONS = {
  // The dataset's Book list: the Volumes its Citations link into and those
  // added by hand, by archive.
  bookList: asksNothing<ListedBook[]>(),

  // The Volumes view: the Book list's Volumes, then every other one on
  // this computer, each with its page numbers and its buttons' steps; and
  // Storage's fill.
  volumesView: asksNothing<VolumesView>(),

  // Adds the archive's Volume to the Book list: the list.
  listBook: answers<{ volumeId: string; archiveId: string }, ListedBook[]>(
    '{ volumeId, archiveId }',
    ({ volumeId, archiveId }) =>
      isName(volumeId) && isName(archiveId) ? { volumeId, archiveId } : null
  ),

  // Takes a Volume added by hand off the Book list: the list. One the
  // dataset's Citations link into stays.
  unlistBook: answers<{ volumeId: string }, ListedBook[]>(
    '{ volumeId }',
    ({ volumeId }) => (isName(volumeId) ? { volumeId } : null)
  ),

  // A person's Expected entries in the order of their life, each with the
  // parishes it was looked for in and the Volumes it fits.
  personBooks: answers<{ personId: number }, BookSuggestion[]>(
    '{ personId }',
    ({ personId }) => (isId(personId) ? { personId } : null)
  )
};
