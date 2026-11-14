// The operations on a dataset's Citations: a person's Links, a Mark or a
// Discard on a reference, an Entry made, edited or deleted, what a
// Citation says and the Facts it supports, and the Volumes and archives
// they're in.

import type {
  Box,
  ChurchBookArchive,
  CitationLinks,
  CitationRow,
  VolumeChoices,
  VolumeCitation,
  VolumeContents
} from '@/common/types';

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

// Where an entry is, as the Scan viewer gives it: its Box on an Image of a
// Volume, by the Image's file id.
export interface EntryAt {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
}

// An entry made in the app, with what it says, if said.
export interface EntryTarget extends EntryAt {
  text: string | null;
}

// Someone named in an entry, and who they are in it: one of its Book's
// Roles, or none.
export interface InEntry {
  personId: number;
  role: string | null;
}

// An Entry as it should be after an edit; a part left out stays.
export interface EntryEdit {
  at?: EntryAt;
  text?: string | null;
  people?: InEntry[];
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

function entryAtOf(value: unknown): EntryAt | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { volumeId, image, fileId } = fields;
  if (!isName(volumeId) || !isInteger(image) || !isName(fileId)) return null;
  const box = boxOf(fields.box);
  return box === null ? null : { volumeId, image, fileId, box };
}

function entryTargetOf(value: unknown): EntryTarget | null {
  const at = entryAtOf(value);
  const text = optionalString(fieldsOf(value)?.text);
  return at === null || text === undefined ? null : { ...at, text };
}

function inEntryOf(value: unknown): InEntry | null {
  const fields = fieldsOf(value);
  if (fields === null || !isId(fields.personId)) return null;
  const role = optionalString(fields.role);
  return role === undefined ? null : { personId: fields.personId, role };
}

// A part left out stays; one that's there must be read.
function entryEditOf(value: unknown): EntryEdit | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const edit: EntryEdit = {};
  if (fields.at !== undefined) {
    const at = entryAtOf(fields.at);
    if (at === null) return null;
    edit.at = at;
  }
  if (fields.text !== undefined) {
    const text = optionalString(fields.text);
    if (text === undefined) return null;
    edit.text = text;
  }
  if (fields.people !== undefined) {
    const people = listOf(fields.people, inEntryOf);
    if (people === null) return null;
    edit.people = people;
  }
  return edit;
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

  // Makes an Entry with a Citation of it for each person named (ADR-0026):
  // them as the Volume's citations list them, in the order named.
  citeEntry: answers<{ at: EntryTarget; people: InEntry[] }, VolumeCitation[]>(
    '{ at: { volumeId, image, fileId, box, text? }, people: [{ personId, role? }] }',
    (body) => {
      const at = entryTargetOf(body.at);
      const people = listOf(body.people, inEntryOf);
      return at === null || people === null ? null : { at, people };
    }
  ),

  // Changes an Entry as a whole, or refuses all of it (ADR-0026): its
  // Citations as the Volume's citations list them.
  editEntry: answers<{ entryId: number; edit: EntryEdit }, VolumeCitation[]>(
    '{ entryId, edit: { at?, text?, people? } }',
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
