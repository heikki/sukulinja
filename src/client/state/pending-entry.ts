import type { Signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi, InEntry } from '@/client/dataset-api';
import type { Box, VolumeCitation } from '@/common/types';

import type { Selected } from './selected';
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

function same(a: InEntry, b: InEntry) {
  return a.personId === b.personId && a.role === b.role;
}

// Who of those an Entry had are no longer named, in their Role, and who
// is named anew.
function changedPeople<W extends InEntry>(was: W[], people: InEntry[]) {
  return {
    gone: was.filter((w) => !people.some((p) => same(p, w))),
    added: people.filter((p) => !was.some((w) => same(p, w)))
  };
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
}

// Changing the pending new Entry (ADR-0026), if there's one: what it says,
// and who is in it; and saving it.
export function pendingEntry(
  pending: Signal.State<PendingLink | null>,
  { api, selected, fileOf, reload }: SaveDeps
) {
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

  // The Box moved, through one of the Citations it had: a Mark moves the
  // Entry for all.
  async function moveBox(change: PendingLink, editing: EntryEdit) {
    const [via] = editing.was;
    const { volumeId, image, box } = change;
    const same = JSON.stringify(box) === JSON.stringify(editing.box);
    if (!same && via !== undefined) {
      await api.mark(via.citationId, { volumeId, image, box });
    }
  }

  // The source's Entry changed as the pending one says, everyone's: its
  // Box moved, what it says, those named added, then those no longer
  // named taken out, so it's never left empty. Who of those it had are
  // still in it, by their Citation. Throws ApiError if it's refused.
  async function saveEdit(change: PendingLink, editing: EntryEdit) {
    const { people = [], text = '' } = change.cite ?? {};
    if (people.length === 0) throw new ApiError('Name someone in the entry.');
    const { gone, added } = changedPeople(editing.was, people);
    await moveBox(change, editing);
    const said = text.trim();
    if (said !== editing.text.trim()) {
      await api.transcribe(editing.entryId, said === '' ? null : said);
    }
    for (const p of added) {
      // eslint-disable-next-line no-await-in-loop -- one at a time, in order
      await api.addToEntry(editing.entryId, p);
    }
    for (const w of gone) {
      // eslint-disable-next-line no-await-in-loop -- one at a time
      await api.uncite(w.citationId);
    }
    void selected.refresh();
    await reload(change.volumeId);
    if (pending.get() === change) pending.set(null);
    return editing.was
      .filter((w) => !gone.includes(w))
      .map((w) => w.citationId);
  }

  return { setText, setInEntry, drop, save, editing, saveEdit };
}
