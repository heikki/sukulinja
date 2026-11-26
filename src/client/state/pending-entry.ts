import { computed } from '@lit-labs/signals';
import type { Signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi, InEntry } from '@/client/dataset-api';
import { eventRoles } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import { changesLock } from '@/common/entry-lock';
import { citingImage } from '@/common/entry-naming';
import type { Offer } from '@/common/entry-offers';
import type { Newcomer } from '@/common/operations';
import type { Box, PersonName, VolumeCitation } from '@/common/types';

import { datesRefusal, editedTyped, entryLines, fieldsOf } from './entry-lines';
import type { TypedFields } from './entry-lines';
import type { PendingChange } from './pending-change';
import type { Readable, Selected } from './selected';

// An Entry not saved yet (ADR-0026), new or the source's changed: the
// Event it records, null until one is chosen (ADR-0033), who is in it,
// each in their Role if its Event has Roles, what it says, its fields as
// typed, the boxes pressed on the lines of what they'd do to the tree, by
// lineKey, and those it names who aren't in the tree yet, to make with it.
// Editing one, its kind and owner are shown as saved until their Change…
// is pressed (`unlocked`, ADR-0037).
export interface PendingCite {
  event: EntryEvent | null;
  people: InEntry[];
  text: string;
  fields: TypedFields;
  ticks: Record<string, boolean>;
  newcomers: Newcomer[];
  unlocked?: Lock[];
}

// What of an Entry stays as saved: its kind, and its owner.
export type Lock = 'kind' | 'owner';

// The source's Entry as it was when its editing began: who was in it, by
// their Citation, what it said, and its Box, on the Image shown unless
// `image` says.
export interface EntryEdit {
  entryId: number;
  event: EntryEvent | null;
  was: Array<InEntry & { citationId: number }>;
  text: string;
  box: Box;
  image?: number;
}

// Changing the pending Entry, as the Entry pane does.
export interface EntryForm {
  // Who can't be named in it: those with a Citation linking its Image
  // that isn't of the Entry being edited, as the server refuses them, and
  // those named, but someone named in no Role of a Book with Roles can
  // still be given one.
  notNamable: Readable<Set<number>>;
  // Chooses the Event it records, naming these people then.
  setEvent: (event: EntryEvent, people: InEntry[]) => void;
  setText: (text: string) => void;
  setField: (key: keyof TypedFields, text: string) => void;
  // A line's box set, by lineKey.
  setTick: (key: string, on: boolean) => void;
  // What its fields would do to the tree as it is, for its Entry pane to list.
  offers: Readable<Offer[]>;
  setInEntry: (person: InEntry) => void;
  // Someone not in the tree, by their name, to name in it and make with
  // it: the number that stands for them (below zero).
  nameNew: (name: PersonName) => number;
  setPeople: (people: InEntry[]) => void;
  drop: (personId: number) => void;
  // Its kind or owner made to change, its Change… pressed.
  unlock: (lock: Lock) => void;
  // Whether it's saved as a new Entry, its kind or owner changed.
  anew: Readable<boolean>;
}

// What saving the pending Entry needs of the viewer.
interface SaveDeps {
  api: DatasetApi;
  selected: Selected;
  // The file id of Image `n` of the Volume shown, in Astia's list; null
  // until it's listed.
  fileOf: (n: number) => string | null;
  // The Volume's citations read again.
  reload: (volumeId: string) => Promise<void>;
  // The Volume's citations; null until they arrive.
  citations: Readable<VolumeCitation[] | null | 'failed'>;
  // Told once an Entry saved may have made people or Facts.
  treeChanged: () => void;
}

type NewEntry = PendingChange & { kind: 'new' };

// The newcomers it still names, those named in its place since left out.
function namedNew({ people, newcomers }: PendingCite) {
  return newcomers.filter((n) => people.some((p) => p.personId === n.personId));
}
type EditedEntry = PendingChange & { kind: 'edit' };

// Whether the Entry edited is saved as a new one: its kind or owner
// changed (ADR-0037).
function isAnew(change: PendingChange) {
  if (change.kind !== 'edit') return false;
  const { editing, cite } = change;
  return changesLock({ event: editing.event, people: editing.was }, cite);
}

// The Entry being edited, as its lines are asked; or the one a new Entry
// replaces.
function editedId(change: PendingChange): {
  entryId?: number;
  replacing?: number;
} {
  if (change.kind !== 'edit') return {};
  const id = change.editing.entryId;
  return isAnew(change) ? { replacing: id } : { entryId: id };
}

// Throws ApiError for a date in the Entry pane that can't be read.
function refuseDates(cite: PendingCite) {
  const wrong = datesRefusal(cite.event, cite.fields);
  if (wrong !== null) throw new ApiError(wrong);
}

// Throws ApiError for an Entry pane that can't be saved: one naming no one, of
// no Event where `needsEvent`, or with a date that can't be read.
function refuse(cite: PendingCite, needsEvent: boolean) {
  if (cite.people.length === 0) {
    throw new ApiError('Name someone in the entry.');
  }
  if (needsEvent && cite.event === null) {
    throw new ApiError('Choose what kind of entry it is.');
  }
  refuseDates(cite);
}

// Changing the pending Entry (ADR-0026), new or edited, if there's one:
// what it says, and who is in it; and saving it.
export function pendingEntry(
  pending: Signal.State<PendingChange | null>,
  { api, selected, fileOf, reload, citations, treeChanged }: SaveDeps
) {
  const lines = entryLines(api);

  // The lines asked for the pending Entry as it is now.
  function refresh() {
    const now = pending.get();
    if (now === null || now.kind === 'mark') {
      lines.clear();
      return;
    }
    lines.ask({ volumeId: now.volumeId, ...editedId(now), ...now.cite });
  }

  // The lines asked afresh, as the pending change begins: the tree may
  // have changed since they were last asked.
  function begin() {
    lines.clear();
    refresh();
  }

  const notNamable = computed(() => {
    const change = pending.get();
    if (change === null || change.kind === 'mark') return new Set<number>();
    const { cite } = change;
    const rows = citations.get();
    const editing = change.kind === 'edit' ? change.editing.entryId : null;
    const roles = eventRoles(cite.event).length;
    const named = cite.people.filter((p) => p.role !== null || roles === 0);
    // The record being placed's Citations join its Entry.
    const joining = change.kind === 'place' ? change.markKey : null;
    const others = (Array.isArray(rows) ? rows : []).filter(
      (r) => r.citation.markKey !== joining
    );
    return new Set([
      ...citingImage(others, change.image, editing),
      ...named.map((p) => p.personId)
    ]);
  });

  function change(to: (cite: PendingCite) => Partial<PendingCite>) {
    const now = pending.get();
    if (now !== null && now.kind !== 'mark') {
      pending.set({ ...now, cite: { ...now.cite, ...to(now.cite) } });
    }
    refresh();
  }

  function setEvent(event: EntryEvent, people: InEntry[]) {
    change(() => ({ event, people }));
  }

  // What it says, as typed.
  function setText(text: string) {
    change(() => ({ text }));
  }

  function setField(key: keyof TypedFields, text: string) {
    change(({ fields }) => ({ fields: { ...fields, [key]: text } }));
  }

  function setTick(key: string, on: boolean) {
    change(({ ticks }) => ({ ticks: { ...ticks, [key]: on } }));
  }

  // The fields and lines to save with the Entry, as it is now, the one
  // edited or replaced given. Throws ApiError for a date that can't be
  // read.
  async function saying(
    volumeId: string,
    cite: PendingCite,
    ids: { entryId?: number; replacing?: number } = {}
  ) {
    refuseDates(cite);
    return {
      fields: fieldsOf(cite.event, cite.fields),
      ticked: await lines.ticked({ volumeId, ...ids, ...cite }, cite.ticks)
    };
  }

  // Names the person in the Role, in place of whoever had it; with no
  // Role, adds them.
  function setInEntry(person: InEntry) {
    change(({ people }) => ({
      people: [
        ...people.filter(
          (p) =>
            p.personId !== person.personId &&
            (person.role === null || p.role !== person.role)
        ),
        person
      ]
    }));
  }

  // Takes the person out of it, and someone new out of those to make.
  function drop(personId: number) {
    change(({ people, newcomers }) => ({
      people: people.filter((p) => p.personId !== personId),
      newcomers: newcomers.filter((n) => n.personId !== personId)
    }));
  }

  function nameNew(name: PersonName) {
    const now = pending.get();
    const was = now === null || now.kind === 'mark' ? [] : now.cite.newcomers;
    const personId = Math.min(0, ...was.map((n) => n.personId)) - 1;
    change(({ newcomers }) => ({
      newcomers: [...newcomers, { personId, name }]
    }));
    return personId;
  }

  // The new Entry's Citations show beside the scan once the Volume's
  // citations reload, and in the person's sources if they're the Selected
  // person; theirs, else the first named, is given back. Null when the
  // viewer moved on meanwhile. Throws ApiError if it's refused.
  async function save(change: NewEntry) {
    const { volumeId, image: at, box, cite } = change;
    const fileId = fileOf(at);
    if (fileId === null) {
      throw new ApiError("The Image isn't listed yet; try again.");
    }
    refuse(cite, false);
    const text = cite.text.trim();
    const made = await api.citeEntry(
      {
        volumeId,
        image: at,
        fileId,
        box,
        event: cite.event,
        text: text === '' ? null : text,
        newcomers: namedNew(cite),
        ...(await saying(volumeId, cite))
      },
      cite.people
    );
    const id = selected.id.get();
    if (cite.people.some((p) => p.personId === id)) void selected.refresh();
    treeChanged();
    await reload(volumeId);
    if (pending.get() !== change) return null;
    pending.set(null);
    return made.find((m) => m.personId === id) ?? made[0] ?? null;
  }

  // The pending change for editing the Entry, with its Citations' rows;
  // `from` where its Box was, if on another Image.
  function editing(
    entryId: number,
    box: Box,
    rows: VolumeCitation[],
    from?: { image: number; box: Box }
  ) {
    const was = rows.map((r) => ({
      personId: r.personId,
      role: r.citation.role,
      citationId: r.citation.id
    }));
    const text = rows[0]?.citation.text ?? '';
    const event = rows[0]?.citation.event ?? null;
    const fields = editedTyped(event, rows[0]?.citation.fields ?? null, text);
    const people = was.map(({ personId, role }) => ({ personId, role }));
    return {
      cite: { event, people, text, fields, ticks: {}, newcomers: [] },
      editing: { entryId, event, was, text, ...(from ?? { box }) }
    };
  }

  // Where the Box is now, if it moved.
  function movedTo(change: EditedEntry) {
    const { volumeId, image, box, editing } = change;
    const sameImage = editing.image === undefined || editing.image === image;
    if (sameImage && JSON.stringify(box) === JSON.stringify(editing.box)) {
      return {};
    }
    const fileId = fileOf(image);
    if (fileId === null) {
      throw new ApiError("The Image isn't listed yet; try again.");
    }
    return { at: { volumeId, image, fileId, box } };
  }

  // The source's Entry changed as the pending one says, everyone's, in one
  // request: all of it or, refused, none. Who of those it had are still in
  // it, by their Citation. Throws ApiError if it's refused.
  async function saveEdit(change: EditedEntry) {
    const { editing } = change;
    const { cite } = change;
    const { event, people, text } = cite;
    refuse(cite, true);
    if (event === null) return [];
    const said = text.trim();
    const rows = isAnew(change)
      ? await saveAnew(change, said === '' ? null : said)
      : await api.editEntry(editing.entryId, {
          ...movedTo(change),
          ...(event === editing.event ? {} : { event }),
          text: said === '' ? null : said,
          people,
          newcomers: namedNew(cite),
          ...(await saying(change.volumeId, cite, {
            entryId: editing.entryId
          }))
        });
    void selected.refresh();
    treeChanged();
    await reload(change.volumeId);
    if (pending.get() === change) pending.set(null);
    const now = new Set(rows.map((r) => r.citation.id));
    return editing.was.map((w) => w.citationId).filter((id) => now.has(id));
  }

  // The Entry edited saved as a new one where its Box is now, which
  // removes it (ADR-0037): the new one's Citations.
  async function saveAnew(change: EditedEntry, text: string | null) {
    const { volumeId, image, box, cite, editing } = change;
    const fileId = fileOf(image);
    if (fileId === null) {
      throw new ApiError("The Image isn't listed yet; try again.");
    }
    const replacing = editing.entryId;
    return await api.citeEntry(
      {
        volumeId,
        image,
        fileId,
        box,
        event: cite.event,
        text,
        newcomers: namedNew(cite),
        replacing,
        ...(await saying(volumeId, cite, { replacing }))
      },
      cite.people
    );
  }

  // Names these people in it, in place of those it named.
  function setPeople(people: InEntry[]) {
    change(() => ({ people }));
  }

  function unlock(lock: Lock) {
    change(({ unlocked = [] }) => ({ unlocked: [...unlocked, lock] }));
  }

  const anew = computed(() => {
    const now = pending.get();
    return now !== null && isAnew(now);
  });

  const form: EntryForm = {
    unlock,
    anew,
    notNamable,
    setEvent,
    setText,
    setField,
    setTick,
    offers: lines.offers,
    setInEntry,
    nameNew,
    setPeople,
    drop
  };
  return { form, save, editing, saveEdit, begin, refuse };
}
