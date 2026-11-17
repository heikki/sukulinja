// An Entry (ADR-0026, ADR-0033) as the operations on it carry it: where
// it is, the Event it records, its people, what it says, its dates and
// place, and the lines of what it would do to the tree ticked; each read
// from a request's body.

import { isEntryEvent, NO_FIELDS } from '@/common/entry-events';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';
import type { Box } from '@/common/types';

import {
  boxOf,
  fieldsOf,
  isId,
  isInteger,
  isName,
  listOf,
  optionalString
} from './read';
import type { Fields } from './read';

// Where an entry is, as the Scan viewer gives it: its Box on an Image of a
// Volume, by the Image's file id.
export interface EntryAt {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
}

// An entry made in the app, with the Event it records, chosen on its card
// (null for none chosen, which is refused), what it says, if said, its
// dates and place (ADR-0033), and the lines of what it would do to the
// tree that were ticked.
export interface EntryTarget extends EntryAt {
  event: EntryEvent | null;
  text: string | null;
  fields: EntryFields;
  ticked: Ticked[];
}

// Someone named in an entry, and who they are in it: one of its Event's
// Roles, or none.
export interface InEntry {
  personId: number;
  role: string | null;
}

// An Entry as it should be after an edit; a part left out stays.
// The lines ticked are done whatever else changes.
export interface EntryEdit {
  at?: EntryAt;
  event?: EntryEvent;
  text?: string | null;
  people?: InEntry[];
  fields?: EntryFields;
  ticked?: Ticked[];
}

// What an Entry of the Event in the Volume, naming the people, with the
// fields, would do to the tree: its card's list (common/entry-offers).
export interface EntryAsked {
  volumeId: string;
  event: EntryEvent | null;
  people: InEntry[];
  fields: EntryFields;
}

export function entryAtOf(value: unknown): EntryAt | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { volumeId, image, fileId } = fields;
  if (!isName(volumeId) || !isInteger(image) || !isName(fileId)) return null;
  const box = boxOf(fields.box);
  return box === null ? null : { volumeId, image, fileId, box };
}

// An Event, or null for none chosen; undefined for anything else.
function eventOf(value: unknown): EntryEvent | null | undefined {
  if (value === undefined || value === null) return null;
  return isEntryEvent(value) ? value : undefined;
}

// Each of the fields a string or null; none left out reads as none said.
export function entryFieldsOf(value: unknown): EntryFields | null {
  if (value === undefined) return NO_FIELDS;
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const read = {
    date: optionalString(fields.date),
    lifeDate: optionalString(fields.lifeDate),
    village: optionalString(fields.village),
    farm: optionalString(fields.farm)
  };
  return Object.values(read).includes(undefined) ? null : (read as EntryFields);
}

function tickedOf(value: unknown): Ticked | null {
  const fields = fieldsOf(value);
  if (fields === null || !isName(fields.tag)) return null;
  const { tag, action } = fields;
  return action === 'add' || action === 'support' || action === 'change'
    ? { tag, action }
    : null;
}

// The lines ticked; none left out.
export function tickedListOf(value: unknown) {
  return value === undefined ? [] : listOf(value, tickedOf);
}

export function entryTargetOf(value: unknown): EntryTarget | null {
  const at = entryAtOf(value);
  const fields = fieldsOf(value);
  const text = optionalString(fields?.text);
  const event = eventOf(fields?.event);
  const said = entryFieldsOf(fields?.fields);
  const ticked = tickedListOf(fields?.ticked);
  if (at === null || text === undefined || event === undefined) return null;
  if (said === null || ticked === null) return null;
  return { ...at, event, text, fields: said, ticked };
}

export function inEntryOf(value: unknown): InEntry | null {
  const fields = fieldsOf(value);
  if (fields === null || !isId(fields.personId)) return null;
  const role = optionalString(fields.role);
  return role === undefined ? null : { personId: fields.personId, role };
}

// A part left out stays; one that's there must be read.
export function entryEditOf(value: unknown): EntryEdit | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const edit: EntryEdit = {};
  if (fields.at !== undefined) {
    const at = entryAtOf(fields.at);
    if (at === null) return null;
    edit.at = at;
  }
  if (fields.event !== undefined) {
    if (!isEntryEvent(fields.event)) return null;
    edit.event = fields.event;
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
  return said(fields, edit);
}

// An edit with its fields and ticks read onto it.
function said(fields: Fields, edit: EntryEdit): EntryEdit | null {
  const read =
    fields.fields === undefined ? undefined : entryFieldsOf(fields.fields);
  const ticked = tickedListOf(fields.ticked);
  if (read === null || ticked === null) return null;
  return {
    ...edit,
    ...(read === undefined ? {} : { fields: read }),
    ...(fields.ticked === undefined ? {} : { ticked })
  };
}

export function entryAskedOf(value: unknown): EntryAsked | null {
  const fields = fieldsOf(value);
  if (fields === null || !isName(fields.volumeId)) return null;
  const event = eventOf(fields.event);
  const people = listOf(fields.people, inEntryOf);
  const said = entryFieldsOf(fields.fields);
  if (event === undefined || people === null || said === null) return null;
  return { volumeId: fields.volumeId, event, people, fields: said };
}
