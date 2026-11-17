import { computed } from '@lit-labs/signals';
import type { Signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi, InEntry } from '@/client/dataset-api';
import { eventRoles } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import { citingImage } from '@/common/entry-naming';
import type { Offer } from '@/common/entry-offers';
import type { Box, VolumeCitation } from '@/common/types';

import { datesRefusal, entryLines, fieldsOf, typedOf } from './entry-lines';
import type { TypedFields } from './entry-lines';
import type { PendingChange } from './pending-change';
import type { Readable, Selected } from './selected';

// An Entry not saved yet (ADR-0026), new or the source's changed: the
// Event it records, null until one is chosen (ADR-0033), who is in it,
// each in their Role if its Event has Roles, what it says, its fields as
// typed, and the boxes pressed on the lines of what they'd do to the
// tree, by lineKey.
export interface PendingCite {
  event: EntryEvent | null;
  people: InEntry[];
  text: string;
  fields: TypedFields;
  ticks: Record<string, boolean>;
}

// The source's Entry as it was when its editing began: who was in it, by
// their Citation, what it said, and its Box.
export interface EntryEdit {
  entryId: number;
  event: EntryEvent | null;
  was: Array<InEntry & { citationId: number }>;
  text: string;
  box: Box;
}

// Changing the pending Entry, as the Scan viewer's card does.
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
  // What its fields would do to the tree as it is, for its card to list.
  offers: Readable<Offer[]>;
  setInEntry: (person: InEntry) => void;
  setPeople: (people: InEntry[]) => void;
  drop: (personId: number) => void;
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
}

type NewEntry = PendingChange & { kind: 'new' };
type EditedEntry = PendingChange & { kind: 'edit' };

// Changing the pending Entry (ADR-0026), new or edited, if there's one:
// what it says, and who is in it; and saving it.
export function pendingEntry(
  pending: Signal.State<PendingChange | null>,
  { api, selected, fileOf, reload, citations }: SaveDeps
) {
  const lines = entryLines(api);

  // The lines asked for the pending Entry as it is now.
  function refresh() {
    const now = pending.get();
    if (now === null || now.kind === 'mark') {
      lines.clear();
      return;
    }
    lines.ask({ volumeId: now.volumeId, ...now.cite });
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
    return new Set([
      ...citingImage(Array.isArray(rows) ? rows : [], change.image, editing),
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

  // The fields and lines to save with the Entry, as it is now. Throws
  // ApiError for a date that can't be read.
  async function saying(volumeId: string, cite: PendingCite) {
    const wrong = datesRefusal(cite.event, cite.fields);
    if (wrong !== null) throw new ApiError(wrong);
    return {
      fields: fieldsOf(cite.event, cite.fields),
      ticked: await lines.ticked({ volumeId, ...cite }, cite.ticks)
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

  // Takes the person out of it.
  function drop(personId: number) {
    change(({ people }) => ({
      people: people.filter((p) => p.personId !== personId)
    }));
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
    if (cite.people.length === 0) {
      throw new ApiError('Name someone in the entry.');
    }
    const text = cite.text.trim();
    const made = await api.citeEntry(
      {
        volumeId,
        image: at,
        fileId,
        box,
        event: cite.event,
        text: text === '' ? null : text,
        ...(await saying(volumeId, cite))
      },
      cite.people
    );
    const id = selected.id.get();
    if (cite.people.some((p) => p.personId === id)) void selected.refresh();
    await reload(volumeId);
    if (pending.get() !== change) return null;
    pending.set(null);
    return made.find((m) => m.personId === id) ?? made[0] ?? null;
  }

  // The pending change for editing the Entry, with its Citations' rows.
  function editing(entryId: number, box: Box, rows: VolumeCitation[]) {
    const was = rows.map((r) => ({
      personId: r.personId,
      role: r.citation.role,
      citationId: r.citation.id
    }));
    const text = rows[0]?.citation.text ?? '';
    const event = rows[0]?.citation.event ?? null;
    const fields = typedOf(rows[0]?.citation.fields ?? null);
    const people = was.map(({ personId, role }) => ({ personId, role }));
    return {
      cite: { event, people, text, fields, ticks: {} },
      editing: { entryId, event, was, text, box }
    };
  }

  // Where the Box is now, if it moved.
  function movedTo(change: EditedEntry) {
    const { volumeId, image, box, editing } = change;
    if (JSON.stringify(box) === JSON.stringify(editing.box)) return {};
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
    if (people.length === 0) throw new ApiError('Name someone in the entry.');
    if (event === null) throw new ApiError('Choose what kind of entry it is.');
    const said = text.trim();
    const rows = await api.editEntry(editing.entryId, {
      ...movedTo(change),
      ...(event === editing.event ? {} : { event }),
      text: said === '' ? null : said,
      people,
      ...(await saying(change.volumeId, cite))
    });
    void selected.refresh();
    await reload(change.volumeId);
    if (pending.get() === change) pending.set(null);
    const now = new Set(rows.map((r) => r.citation.id));
    return editing.was.map((w) => w.citationId).filter((id) => now.has(id));
  }

  // Names these people in it, in place of those it named.
  function setPeople(people: InEntry[]) {
    change(() => ({ people }));
  }

  const form: EntryForm = {
    notNamable,
    setEvent,
    setText,
    setField,
    setTick,
    offers: lines.offers,
    setInEntry,
    setPeople,
    drop
  };
  return { form, save, editing, saveEdit, begin };
}
