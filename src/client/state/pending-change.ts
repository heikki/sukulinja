import { signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import type { EntryEvent } from '@/common/entry-events';
import type { Box, CitationRow, VolumeCitation } from '@/common/types';

import { NO_TYPED } from './entry-lines';
import type { TypedFields } from './entry-lines';
import { pendingEntry } from './pending-entry';
import type { EntryEdit, EntryForm, PendingCite } from './pending-entry';
import { imageOf, markedIn } from './places';
import type { Readable, Selected } from './selected';
import type { ImageOpen, LinkOpen } from './source-open';

// Where a pending Box is: on an Image of a Volume.
export interface PendingAt {
  volumeId: string;
  volume: string;
  image: number;
  box: Box;
}

// A change in the Scan viewer not saved yet, of one of three kinds:
// - 'place': a Church-book reference's entry is at the Box, its Mark
//   making it an Entry (ADR-0016), which is then named and told as an
//   edited one is; `named` are those it started with, everyone citing
//   the record;
// - 'new': a new Entry at the Box, with a Citation for each person named,
//   on the Image shown, with a source or none (ADR-0026);
// - 'edit': the source's Entry as it should be, its Box, people and words
//   changed at once (ADR-0026).
export type PendingChange =
  | (PendingAt & {
      kind: 'place';
      cite: PendingCite;
      named: number[];
      markKey: string;
    })
  | (PendingAt & { kind: 'new'; cite: PendingCite })
  | (PendingAt & { kind: 'edit'; cite: PendingCite; editing: EntryEdit });

// Whom a Church-book reference's entry names, and of what Event, as its
// Box is placed: the Entry pane's first guess, as for a new Entry.
export interface EntryStart {
  event: EntryEvent | null;
  people: InEntry[];
  // What its record says of it, typed as the Entry pane types it.
  fields: TypedFields;
}

// What the pending change needs of the viewer it's in.
export interface PendingDeps {
  api: DatasetApi;
  selected: Selected;
  source: Readable<LinkOpen | null>;
  // Where a new Box goes: the Image shown of the Volume shown; null while
  // none is, or while it's read-only, on a filming Astia replaced.
  placeable: () => { volumeId: string; volume: string; image: number } | null;
  // The file id of Image `n` of the Volume shown; null until it's listed.
  fileOf: (n: number) => string | null;
  // The Volume's citations read again.
  reload: (volumeId: string) => Promise<void>;
  citations: Readable<VolumeCitation[] | null | 'failed'>;
  // Told once an Entry saved may have made people or Facts.
  treeChanged: () => void;
  // Told as a Box is placed: what else was asked of the Image is dropped.
  placing: () => void;
  // The viewer to the source's Link, or onto an Image with no source.
  openLink: (open: LinkOpen) => void;
  openImage: (at: ImageOpen) => void;
}

export interface Pending {
  change: Readable<PendingChange | null>;
  // A new Entry at the Box, of the Event guessed, with the people in it
  // so far.
  newEntry: (box: Box, event: EntryEvent | null, people: InEntry[]) => void;
  // The source's entry at the Box, on the Image shown, as its Entry pane says:
  // its Entry's edited, with its Box moved here; a Church-book
  // reference's placed, its Mark making it an Entry of `start`'s; a
  // Citation made in the app with no Entry only moved, as `mark` does.
  // With a change pending, its Box moved here.
  placeSource: (box: Box, start: EntryStart) => void;
  // The source's Entry to edit, from its Citations' rows, at the Box on
  // the Image shown; `from` is where its Box was, when on another Image.
  editEntry: (
    entryId: number,
    box: Box,
    rows: VolumeCitation[],
    from?: { image: number; box: Box }
  ) => void;
  // The pending Box moved; the change stays of its kind.
  moveBox: (box: Box) => void;
  // Changing a new or edited Entry's people and words.
  form: EntryForm;
  // Nothing pending.
  drop: () => void;
  // Back from the change: a Mark back to the source's Link; anything
  // else stays on the Image.
  cancel: () => void;
  // Saves it, throwing ApiError if it's refused: a new Entry's Citation
  // to open, its person's if they're the Selected person, else null.
  save: () => Promise<VolumeCitation | null>;
  // A Match in the Volume confirmed: a Mark where its Box is.
  confirm: (
    row: Pick<VolumeCitation, 'citation' | 'link'>,
    volumeId: string
  ) => Promise<void>;
}

// What a pending change is, wherever it is.
type Kind =
  | { kind: 'place'; cite: PendingCite; named: number[]; markKey: string }
  | { kind: 'new'; cite: PendingCite }
  | { kind: 'edit'; cite: PendingCite; editing: EntryEdit };

function kindOf(change: PendingChange): Kind {
  if (change.kind === 'place') {
    const { cite, named, markKey } = change;
    return { kind: 'place', cite, named, markKey };
  }
  if (change.kind === 'new') return { kind: 'new', cite: change.cite };
  return { kind: 'edit', cite: change.cite, editing: change.editing };
}

// An Entry pane to start with: of the Event, naming the people, with the fields
// given, else nothing typed.
function startCite(
  event: EntryEvent | null,
  people: InEntry[],
  fields: TypedFields = NO_TYPED
): PendingCite {
  return {
    event,
    people,
    text: '',
    fields,
    ticks: {},
    newcomers: []
  };
}

// Nothing typed in the Entry pane, no one new and no box set.
function untold(cite: PendingCite) {
  return (
    Object.values(cite.fields).every((f) => f.trim() === '') &&
    cite.newcomers.length === 0 &&
    Object.keys(cite.ticks).length === 0
  );
}

// Whether the Entry pane says what the Entry does: its Event, and the same
// people in the same Roles, with nothing more to it.
function sameEntry(cite: PendingCite, made: PendingCite) {
  function roles(people: InEntry[]) {
    return people
      .map((p) => `${p.personId} ${p.role ?? ''}`)
      .sort()
      .join(',');
  }
  return (
    untold(cite) &&
    (cite.event === null || cite.event === made.event) &&
    roles(cite.people) === roles(made.people)
  );
}

export function pendingChange(deps: PendingDeps): Pending {
  const { selected, source, placeable, fileOf, reload, citations } = deps;
  const change = signal<PendingChange | null>(null);
  const entry = pendingEntry(change, {
    api: deps.api,
    selected,
    fileOf,
    reload,
    citations,
    treeChanged: deps.treeChanged
  });

  function place(box: Box, kind: Kind) {
    const at = placeable();
    if (at === null) return;
    if (kind.kind === 'place' && source.get() === null) return;
    deps.placing();
    change.set({ ...at, box, ...kind });
    entry.begin();
  }

  function moveBox(box: Box) {
    const now = change.get();
    if (now !== null) place(box, kindOf(now));
  }

  function cancel() {
    const was = change.get();
    if (was === null) return;
    const shown = source.get();
    if (was.kind === 'place' && shown !== null && shown.link !== null) {
      deps.openLink(shown);
    } else {
      change.set(null);
    }
  }

  // The Mark reloads the Volume's citations, as a confirmation does, and
  // the viewer follows the new Link. The pending Box stays until they're
  // in, or the Link's old Box shows again in between.
  // The Citation it opened on, null when it didn't.
  async function saveMark(was: PendingChange) {
    const shown = source.get();
    if (shown === null) return null;
    const { volumeId, image, box } = was;
    const resolved = await selected.mark(shown.citation.id, {
      volumeId,
      image,
      box
    });
    const link = markedIn(resolved, volumeId);
    if (source.get() !== shown) return null;
    await reload(volumeId);
    if (source.get() !== shown) return null;
    if (link === null) {
      change.set(null);
      return null;
    }
    const citation = reread(shown.citation);
    deps.openLink({ citation, link });
    return citation;
  }

  // The reference's entry placed: its Mark first, which makes it an Entry
  // with everyone citing the record (ADR-0016); then that Entry as the
  // Entry pane says, as an edit, unless it says what the Mark made already. A
  // Entry pane that can't be saved is refused before the Mark, and an edit
  // refused stays open on the Entry, its Box saved.
  async function savePlace(was: PendingChange & { kind: 'place' }) {
    const { cite } = was;
    // Left as it started, it needs no Event: the Mark is all it saves.
    const asStarted =
      untold(cite) &&
      cite.people.length === was.named.length &&
      cite.people.every((p) => was.named.includes(p.personId));
    if (!asStarted) entry.refuse(cite, true);
    const citation = await saveMark(was);
    if (citation === null || cite.event === null) return;
    const edit = convertedEdit(was, citation);
    if (edit === null) return;
    change.set(edit);
    entry.begin();
    await saveEdit(edit);
  }

  // The Entry the Mark made, to change as the Entry pane says: those it named
  // to start with and since taken out go, anyone else the Mark brought
  // stays, and what it says is the record's. Null when there's no Entry,
  // or the Entry pane says nothing it doesn't.
  function convertedEdit(
    was: PendingChange & { kind: 'place' },
    citation: CitationRow
  ): (PendingChange & { kind: 'edit' }) | null {
    const { entryId } = citation;
    const rows = citations.get();
    if (entryId === null || !Array.isArray(rows)) return null;
    const inEntry = rows.filter((r) => r.citation.entryId === entryId);
    if (inEntry.length === 0) return null;
    const made = entry.editing(entryId, was.box, inEntry);
    const asked = was.cite.people;
    const brought = made.cite.people.filter(
      (p) =>
        !was.named.includes(p.personId) &&
        !asked.some((a) => a.personId === p.personId)
    );
    const cite = {
      ...was.cite,
      people: [...asked, ...brought],
      text: made.cite.text
    };
    if (sameEntry(cite, made.cite)) return null;
    const { volumeId, volume, image, box } = was;
    return {
      ...{ volumeId, volume, image, box },
      kind: 'edit',
      cite,
      editing: made.editing
    };
  }

  // The Citation as the Volume's citations read again have it: a Mark at
  // the entry makes a reference a Citation of its Image (ADR-0016).
  function reread(citation: CitationRow) {
    const rows = citations.get();
    const now = Array.isArray(rows)
      ? rows.find((r) => r.citation.id === citation.id)
      : undefined;
    return now?.citation ?? citation;
  }

  // A confirmation moves its row, and a Page pin its neighbours', so the
  // citations reload. The viewer follows the Link in the marked Volume only
  // when the Mark was for its own reference.
  async function confirm(
    row: Pick<VolumeCitation, 'citation' | 'link'>,
    volumeId: string
  ) {
    const at = imageOf(row.link);
    if (at === null) return;
    const resolved = await selected.mark(row.citation.id, {
      volumeId,
      image: at
    });
    await reload(volumeId);
    const current = source.get();
    const link = markedIn(resolved, volumeId);
    if (current?.citation.id === resolved.citationId && link !== null) {
      deps.openLink({ citation: reread(current.citation), link });
    }
  }

  // The source's Entry changed: the viewer stays on its Citation, at the
  // Box saved, or with the source's own person taken out, on the Image.
  async function saveEdit(was: PendingChange & { kind: 'edit' }) {
    const shown = source.get();
    const kept = await entry.saveEdit(was);
    if (shown === null || source.get() !== shown) return;
    const { link } = shown;
    const { volumeId, volume, image, box } = was;
    if (kept.includes(shown.citation.id) && link?.precision === 'entry') {
      deps.openLink({ citation: shown.citation, link: { ...link, box } });
      return;
    }
    deps.openImage({ volumeId, volume, image });
  }

  async function save() {
    const was = change.get();
    if (was === null) return null;
    switch (was.kind) {
      case 'place':
        await savePlace(was);
        return null;
      case 'new':
        return await entry.save(was);
      case 'edit':
        await saveEdit(was);
        return null;
    }
  }

  return {
    change,
    newEntry(box, event, people) {
      place(box, { kind: 'new', cite: startCite(event, people) });
    },
    placeSource(box, start) {
      const shown = source.get();
      if (shown === null) return;
      if (change.get() !== null) {
        moveBox(box);
        return;
      }
      const { citation, link } = shown;
      const { entryId } = citation;
      const listed = citations.get();
      const rows = Array.isArray(listed)
        ? listed.filter(
            (r) => entryId !== null && r.citation.entryId === entryId
          )
        : [];
      if (entryId !== null && rows.length > 0 && link?.precision === 'entry') {
        const from = { image: link.image, box: link.box };
        const editing = entry.editing(entryId, box, rows, from);
        place(box, { kind: 'edit', ...editing });
      } else if (entryId === null) {
        const named = [...new Set(start.people.map((p) => p.personId))];
        const cite = startCite(start.event, start.people, start.fields);
        const { markKey } = citation;
        place(box, { kind: 'place', cite, named, markKey });
      }
    },
    editEntry(entryId, box, rows, from) {
      const editing = entry.editing(entryId, box, rows, from);
      place(box, { kind: 'edit', ...editing });
    },
    moveBox,
    form: entry.form,
    drop() {
      change.set(null);
    },
    cancel,
    save,
    confirm
  };
}
