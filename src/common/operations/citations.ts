// The operations on a dataset's Citations: a person's Links, a Mark or a
// Discard on a reference, an Entry made, edited or deleted, what a
// Citation says and the Facts it supports, and the Volumes and archives
// they're in.

import { isClaudeModel } from '@/common/assistant-choices';
import type { ClaudeModel } from '@/common/assistant-choices';
import type { Offer } from '@/common/entry-offers';
import type {
  Box,
  ChurchBookArchive,
  CitationLinks,
  CitationRow,
  PageMark,
  PageNumbering,
  VisionPageTry,
  VisionSurvey,
  VolumeChoices,
  VolumeCitation,
  VolumeContents,
  VolumeLocating,
  VolumePages
} from '@/common/types';

import { entryAskedOf, entryEditOf, entryTargetOf, inEntryOf } from './entries';
import type { EntryAsked, EntryEdit, EntryTarget, InEntry } from './entries';
import { answers, asksNothing, streams } from './operation';
import {
  boxOf,
  fieldsOf,
  isId,
  isInteger,
  isName,
  listOf,
  optionalString
} from './read';

// One page, or a spread's two following each other.
function isPages(value: unknown): value is number[] {
  if (!Array.isArray(value) || !value.every(isId)) return false;
  return (
    value.length <= 1 || (value.length === 2 && value[1] === value[0]! + 1)
  );
}

// Where a Mark says the record is, in any Volume of the parish: on an
// Image, or only somewhere in the Volume. On an Image, `box` is where the
// entry is drawn, in pixels of the full-size Image, null for none; left
// out, a Match's Box on that Image is kept, as confirming one does.
export interface MarkTarget {
  volumeId: string;
  image?: number;
  box?: Box | null;
}

// Where a Box is: on an Image of a Volume.
export interface BoxAt {
  volumeId: string;
  image: number;
}

// `{ volumeId, image, box? }`, or `{ volumeId }` for only the Volume; `box`
// null for none.
function markTargetOf(value: unknown): MarkTarget | null {
  const fields = fieldsOf(value);
  if (fields === null || !isName(fields.volumeId)) return null;
  const { volumeId, image, box } = fields;
  if (image === undefined) return box === undefined ? { volumeId } : null;
  if (!isInteger(image)) return null;
  if (box === undefined || box === null) return { volumeId, image, box };
  const drawn = boxOf(box);
  return drawn === null ? null : { volumeId, image, box: drawn };
}

function boxAtOf(value: unknown): BoxAt | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { volumeId, image } = fields;
  return isName(volumeId) && isInteger(image) ? { volumeId, image } : null;
}

export const CITATION_OPERATIONS = {
  // A person's church-book references, a line as each one's Links
  // resolve.
  personLinks: streams<{ personId: number }, CitationLinks>(
    '{ personId }',
    ({ personId }) => (isId(personId) ? { personId } : null)
  ),

  // Saves a Mark: the reference's Links, resolved again.
  mark: answers<{ citationId: number; at: MarkTarget }, CitationLinks>(
    '{ citationId, at: { volumeId, image?, box? } }',
    ({ citationId, at }) => {
      const target = markTargetOf(at);
      return isId(citationId) && target !== null
        ? { citationId, at: target }
        : null;
    }
  ),

  // Takes back the reference's Box at `at`, a Mark's or a Match's: its
  // Links, resolved again.
  discard: answers<{ citationId: number; at: BoxAt }, CitationLinks>(
    '{ citationId, at: { volumeId, image } }',
    ({ citationId, at }) => {
      const boxAt = boxAtOf(at);
      return isId(citationId) && boxAt !== null
        ? { citationId, at: boxAt }
        : null;
    }
  ),

  // Makes an Entry with a Citation of it for each person named (ADR-0026),
  // in place of the one it's `replacing` (ADR-0037): them as the Volume's
  // citations list them, in the order named.
  citeEntry: answers<{ at: EntryTarget; people: InEntry[] }, VolumeCitation[]>(
    '{ at: { volumeId, image, fileId, box, event, text?, fields?, ticked?, replacing? }, people: [{ personId, role? }] }',
    (body) => {
      const at = entryTargetOf(body.at);
      const people = listOf(body.people, inEntryOf);
      return at === null || people === null ? null : { at, people };
    }
  ),

  // What an Entry would do to the tree, as its Entry pane lists it (ADR-0033).
  entryOffers: answers<EntryAsked, Offer[]>(
    '{ volumeId, event, people: [{ personId, role? }], fields }',
    entryAskedOf
  ),

  // Changes an Entry as a whole, or refuses all of it (ADR-0026): its
  // Citations as the Volume's citations list them.
  editEntry: answers<{ entryId: number; edit: EntryEdit }, VolumeCitation[]>(
    '{ entryId, edit: { at?, event?, text?, people?, fields?, ticked? } }',
    ({ entryId, edit }) => {
      const read = entryEditOf(edit);
      return isId(entryId) && read !== null ? { entryId, edit: read } : null;
    }
  ),

  // Puts what a Citation says: its Entry's, for everyone citing it, else
  // its own.
  retext: answers<{ citationId: number; text: string | null }, undefined>(
    '{ citationId, text }',
    ({ citationId, text }) => {
      const read = optionalString(text);
      return isId(citationId) && read !== undefined
        ? { citationId, text: read }
        : null;
    }
  ),

  // Deletes an Entry with all its Citations.
  deleteEntry: answers<{ entryId: number }, undefined>(
    '{ entryId }',
    ({ entryId }) => (isId(entryId) ? { entryId } : null)
  ),

  // Deletes a Citation made in the app.
  uncite: answers<{ citationId: number }, undefined>(
    '{ citationId }',
    ({ citationId }) => (isId(citationId) ? { citationId } : null)
  ),

  // Makes a Citation support one of its person's Facts, or no longer
  // (`on` false): the Citation as it then is.
  support: answers<
    { citationId: number; factId: number; on: boolean },
    CitationRow
  >('{ citationId, factId, on }', ({ citationId, factId, on }) =>
    isId(citationId) && isId(factId) && typeof on === 'boolean'
      ? { citationId, factId, on }
      : null
  ),

  // Looks for the citations' references on one Image at once, in one
  // question to the vision model `model`, and saves the Matches it
  // confirms (ADR-0029).
  findAllOnImage: answers<
    { citationIds: number[]; at: BoxAt; model: ClaudeModel },
    VisionPageTry
  >('{ citationIds, at: { volumeId, image }, model }', (asked) => {
    const { citationIds, model } = asked;
    const at = boxAtOf(asked.at);
    return Array.isArray(citationIds) &&
      citationIds.length > 0 &&
      citationIds.every(isId) &&
      at !== null &&
      isClaudeModel(model)
      ? { citationIds, at, model }
      : null;
  }),

  // Reads how the Volume, `volume` by its label, numbers its pages, with
  // the vision model `model`, and saves the Page numbers read as Page
  // pins (ADR-0032); `fresh`, reading every Image again and replacing the
  // Volume's vision Page pins.
  surveyPages: answers<
    { volumeId: string; volume: string; model: ClaudeModel; fresh: boolean },
    VisionSurvey
  >(
    '{ volumeId, volume, model, fresh }',
    ({ volumeId, volume, model, fresh }) =>
      isName(volumeId) &&
      isName(volume) &&
      isClaudeModel(model) &&
      typeof fresh === 'boolean'
        ? { volumeId, volume, model, fresh }
        : null
  ),

  // Locates every estimate in the Volume, `volume` by its label, with the
  // vision model `model` (ADR-0032): its page survey first where none of
  // its pages are known, then each Image's estimates in one question each,
  // saving the Matches confirmed. Says how it goes, a line a step.
  locateVolume: streams<
    { volumeId: string; volume: string; model: ClaudeModel },
    VolumeLocating
  >('{ volumeId, volume, model }', ({ volumeId, volume, model }) =>
    isName(volumeId) && isName(volume) && isClaudeModel(model)
      ? { volumeId, volume, model }
      : null
  ),

  // The Volumes a reference can be put in.
  volumeChoices: answers<{ citationId: number }, VolumeChoices>(
    '{ citationId }',
    ({ citationId }) => (isId(citationId) ? { citationId } : null)
  ),

  // The dataset's people citing a Volume, wherever its Links put them.
  volumeCitations: answers<{ volumeId: string }, VolumeCitation[]>(
    '{ volumeId }',
    ({ volumeId }) => (isName(volumeId) ? { volumeId } : null)
  ),

  // The pages the Volume's Page pins put on each of its Images, as its
  // estimates count them (ADR-0032); without pins, as its books are
  // numbered, by `volume`, its label; and what's known of its numbering.
  // Page pins are the data folder's, for every dataset.
  volumePages: answers<{ volumeId: string; volume: string }, VolumePages>(
    '{ volumeId, volume }',
    ({ volumeId, volume }) =>
      isName(volumeId) && isName(volume) ? { volumeId, volume } : null
  ),

  // Sets the pages on the Image of the Volume, `volume` by its label, by
  // hand: a hand Page pin of `pages` there, a spread's two following each
  // other or one (its right page following where the Volume numbers
  // pages), or with null that pin taken away. Its pages then.
  setImagePage: answers<
    {
      volumeId: string;
      volume: string;
      image: number;
      pages: number[] | null;
    },
    VolumePages
  >(
    '{ volumeId, volume, image, pages }',
    ({ volumeId, volume, image, pages }) =>
      isName(volumeId) &&
      isName(volume) &&
      isId(image) &&
      (pages === null || isPages(pages))
        ? { volumeId, volume, image, pages }
        : null
  ),

  // Takes every Page pin of the Volume away, hand or the vision model's,
  // so its pages are counted as its book is numbered: its pages then.
  clearVolumePages: answers<{ volumeId: string; volume: string }, VolumePages>(
    '{ volumeId, volume }',
    ({ volumeId, volume }) =>
      isName(volumeId) && isName(volume) ? { volumeId, volume } : null
  ),

  // Marks the Volume's page numbers checked, or as none, locking them, or
  // with null takes the mark away: what's then known of them. Asks
  // nothing of Astia.
  markPages: answers<
    { volumeId: string; volume: string; as: PageMark | null },
    PageNumbering
  >('{ volumeId, volume, as }', ({ volumeId, volume, as }) =>
    isName(volumeId) &&
    isName(volume) &&
    (as === null || as === 'checked' || as === 'none')
      ? { volumeId, volume, as }
      : null
  ),

  // The archives the dataset's church books are in, most cited first.
  archives: asksNothing<ChurchBookArchive[]>(),

  // How many of the dataset's Citations link into each of a parish
  // archive's Volumes, by Volume id; one with none is left out.
  archiveCitations: answers<{ archiveId: string }, Record<string, number>>(
    '{ archiveId }',
    ({ archiveId }) => (isName(archiveId) ? { archiveId } : null)
  ),

  // What Astia says of a Volume, in one answer: its Images and its
  // archive.
  volume: answers<{ volumeId: string }, VolumeContents>(
    '{ volumeId }',
    ({ volumeId }) => (isName(volumeId) ? { volumeId } : null)
  ),

  // Switches the Volume, `volume` by its label, to Astia's new filming:
  // its Images' viewer URLs.
  switchFilming: answers<{ volumeId: string; volume: string }, string[]>(
    '{ volumeId, volume }',
    ({ volumeId, volume }) =>
      isName(volumeId) && isName(volume) ? { volumeId, volume } : null
  )
};
