import { computed } from '@lit-labs/signals';
import type { Signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi, InEntry } from '@/client/dataset-api';
import { entryRoles } from '@/common/books';
import { citingImage } from '@/common/entry-naming';
import type { Box, VolumeCitation } from '@/common/types';

import type { Readable, Selected } from './selected';
import type { PendingLink } from './viewer';

// A new Entry not saved yet (ADR-0026): who is in it, each in their Role
// if its Book has Roles, and what it says, as typed. With `editing`, the
// source's Entry changed instead.
export interface PendingCite {
  people: InEntry[];
  text: string;
  editing?: EntryEdit;
}

// The source's Entry as it was when its editing began: who was in it, by
// their Citation, what it said, and its Box.
export interface EntryEdit {
  entryId: number;
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
  setText: (text: string) => void;
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

// Changing the pending new Entry (ADR-0026), if there's one: what it says,
// and who is in it; and saving it.
export function pendingEntry(
  pending: Signal.State<PendingLink | null>,
  { api, selected, fileOf, reload, citations }: SaveDeps
) {
  const notNamable = computed(() => {
    const change = pending.get();
    const cite = change?.cite;
    if (change === null || cite === undefined) return new Set<number>();
    const rows = citations.get();
    const editing = cite.editing?.entryId ?? null;
    const roles = entryRoles(change.volume).length;
    const named = cite.people.filter((p) => p.role !== null || roles === 0);
    return new Set([
      ...citingImage(Array.isArray(rows) ? rows : [], change.image, editing),
      ...named.map((p) => p.personId)
    ]);
  });

  function change(to: (cite: PendingCite) => Partial<PendingCite>) {
    const link = pending.get();
    if (link?.cite !== undefined) {
      pending.set({ ...link, cite: { ...link.cite, ...to(link.cite) } });
    }
  }

  // What it says, as typed.
  function setText(text: string) {
    change(() => ({ text }));
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
  async function save(change: PendingLink, cite: PendingCite) {
    const { volumeId, image: at, box } = change;
    const fileId = fileOf(at);
    if (fileId === null) {
      throw new ApiError("The Image isn't listed yet; try again.");
    }
    if (cite.people.length === 0) {
      throw new ApiError('Name someone in the entry.');
    }
    const text = cite.text.trim();
    const made = await api.citeEntry(
      { volumeId, image: at, fileId, box, text: text === '' ? null : text },
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
    const people = was.map(({ personId, role }) => ({ personId, role }));
    return { people, text, editing: { entryId, was, text, box } };
  }

  // Where the Box is now, if it moved.
  function movedTo(change: PendingLink, editing: EntryEdit) {
    const { volumeId, image, box } = change;
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
  async function saveEdit(change: PendingLink, editing: EntryEdit) {
    const { people = [], text = '' } = change.cite ?? {};
    if (people.length === 0) throw new ApiError('Name someone in the entry.');
    const said = text.trim();
    const rows = await api.editEntry(editing.entryId, {
      ...movedTo(change, editing),
      text: said === '' ? null : said,
      people
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

  const form: EntryForm = { notNamable, setText, setInEntry, setPeople, drop };
  return { form, save, editing, saveEdit };
}
