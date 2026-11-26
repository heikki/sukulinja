// An Entry (ADR-0026, ADR-0033) as the operations on it carry it: where
// it is, the Event it records, its people, what it says, its dates and
// place, and the lines of what it would do to the tree ticked; each read
// from a request's body.

import { isEntryEvent, NO_FIELDS } from '@/common/entry-events';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';
import type { Box, PersonName } from '@/common/types';

import {
  boxOf,
  fieldsOf,
  isInteger,
  isName,
  listOf,
  optionalString
} from './read';
import type { Fields } from './read';
import { personNameOf } from './tree';

// Where an entry is, as the Scan viewer gives it: its Box on an Image of a
// Volume, by the Image's file id.
export interface EntryAt {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
}

// Someone the Entry names who isn't in the tree yet (ADR-0033), made with
// it from their name: `personId`, below zero, stands for them where it
// names them (InEntry) until they're made.
export interface Newcomer {
  personId: number;
  name: PersonName;
}

// An entry made in the app, with the Event it records, chosen in its Entry pane
// (null for none chosen, which is refused), what it says, if said, its
// dates and place (ADR-0033), the lines of what it would do to the tree
// that were ticked, and those it makes. `replacing` an Entry whose kind
// or owner it changes (ADR-0037): that one is removed with it.
export interface EntryTarget extends EntryAt {
  event: EntryEvent | null;
  text: string | null;
  fields: EntryFields;
  ticked: Ticked[];
  newcomers?: Newcomer[];
  replacing?: number;
}

// Someone named in an entry, and who they are in it: one of its Event's
// Roles, or none. A `personId` below zero is a Newcomer's.
export interface InEntry {
  personId: number;
  role: string | null;
}

// An Entry as it should be after an edit; a part left out stays.
// The lines ticked are done whatever else changes. `ticked` given is all
// of them: a Fact the Entry supports whose line isn't in it, it no longer
// does; left out, its support stays as it is.
export interface EntryEdit {
  at?: EntryAt;
  event?: EntryEvent;
  text?: string | null;
  people?: InEntry[];
  fields?: EntryFields;
  ticked?: Ticked[];
  newcomers?: Newcomer[];
}

// What an Entry of the Event in the Volume, naming the people, with the
// fields, would do to the tree: its Entry pane's list (common/entry-offers).
// An Entry being edited gives its id (`entryId`), so the Facts it
// supports are known as its own; one a new Entry replaces (`replacing`),
// so those it supports are listed as no longer its source.
export interface EntryAsked {
  volumeId: string;
  entryId?: number;
  replacing?: number;
  event: EntryEvent | null;
  people: InEntry[];
  fields: EntryFields;
  newcomers?: Newcomer[];
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
    place: optionalString(fields.place)
  };
  return Object.values(read).includes(undefined) ? null : (read as EntryFields);
}

function tickedOf(value: unknown): Ticked | null {
  const fields = fieldsOf(value);
  if (fields === null || !isName(fields.tag)) return null;
  const { tag, action, factId } = fields;
  if (action !== 'add' && action !== 'support' && action !== 'change') {
    return null;
  }
  if (factId === undefined) return { tag, action };
  return isInteger(factId) ? { tag, action, factId } : null;
}

function newcomerOf(value: unknown): Newcomer | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { personId } = fields;
  const name = personNameOf(fields.name);
  if (!isInteger(personId) || personId >= 0 || name === null) return null;
  return { personId, name };
}

// Those an Entry makes; none left out.
function newcomersOf(value: unknown) {
  return value === undefined ? [] : listOf(value, newcomerOf);
}

// The lines ticked; none left out.
export function tickedListOf(value: unknown) {
  return value === undefined ? [] : listOf(value, tickedOf);
}

// What a new Entry says beside where it is; null if a part can't be read.
function targetSaysOf(fields: Fields): Omit<EntryTarget, keyof EntryAt> | null {
  const text = optionalString(fields.text);
  const event = eventOf(fields.event);
  const said = entryFieldsOf(fields.fields);
  const ticked = tickedListOf(fields.ticked);
  const newcomers = newcomersOf(fields.newcomers);
  if (text === undefined || event === undefined || said === null) return null;
  const replacing = optionalId(fields.replacing);
  if (ticked === null || newcomers === null || replacing === null) return null;
  return { event, text, fields: said, ticked, newcomers, ...replacing };
}

// An Entry's id under `replacing`, if given; null for anything else.
function optionalId(value: unknown): { replacing?: number } | null {
  if (value === undefined) return {};
  return isInteger(value) ? { replacing: value } : null;
}

export function entryTargetOf(value: unknown): EntryTarget | null {
  const at = entryAtOf(value);
  const fields = fieldsOf(value);
  const says = fields === null ? null : targetSaysOf(fields);
  return at === null || says === null ? null : { ...at, ...says };
}

export function inEntryOf(value: unknown): InEntry | null {
  const fields = fieldsOf(value);
  const personId = fields?.personId;
  if (fields === null || !isInteger(personId) || personId === 0) return null;
  const role = optionalString(fields.role);
  return role === undefined ? null : { personId, role };
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

// An edit with its fields, ticks and newcomers read onto it.
function said(fields: Fields, edit: EntryEdit): EntryEdit | null {
  const read =
    fields.fields === undefined ? undefined : entryFieldsOf(fields.fields);
  const ticked = tickedListOf(fields.ticked);
  const newcomers = newcomersOf(fields.newcomers);
  if (read === null || ticked === null || newcomers === null) return null;
  return {
    ...edit,
    ...(read === undefined ? {} : { fields: read }),
    ...(fields.ticked === undefined ? {} : { ticked }),
    ...(newcomers.length === 0 ? {} : { newcomers })
  };
}

// The Entry asked of as edited, or as replaced; null if one can't be read.
function askedIdsOf(fields: Fields) {
  const { entryId } = fields;
  if (entryId !== undefined && !isInteger(entryId)) return null;
  const replacing = optionalId(fields.replacing);
  if (replacing === null) return null;
  return { ...(entryId === undefined ? {} : { entryId }), ...replacing };
}

export function entryAskedOf(value: unknown): EntryAsked | null {
  const fields = fieldsOf(value);
  if (fields === null || !isName(fields.volumeId)) return null;
  const event = eventOf(fields.event);
  const people = listOf(fields.people, inEntryOf);
  const said = entryFieldsOf(fields.fields);
  const newcomers = newcomersOf(fields.newcomers);
  if (event === undefined || people === null || said === null) return null;
  if (newcomers === null) return null;
  const ids = askedIdsOf(fields);
  if (ids === null) return null;
  return {
    volumeId: fields.volumeId,
    ...ids,
    event,
    people,
    fields: said,
    newcomers
  };
}
