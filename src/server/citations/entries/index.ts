// The Entry (ADR-0026): one record written in a church book, on one Image,
// with its Box, its Event and its Transcription, held once for everyone
// whose Citation cites it, each in their Role. Only the app's Citations of
// an Image cite one; a Church-book reference keeps its link on its citation
// until `citations/myheritage/` goes. An Entry is made, edited, and has
// someone unnamed or is removed here, each in one transaction with its
// Changes; storage, the Roles the tree tells and the gathering beside it.

import type { Database } from 'bun:sqlite';

import type { EntryEvent, EntryFields } from '@/common/entry-events';
import {
  ALREADY_LINKED,
  citingImage,
  namingRefusal
} from '@/common/entry-naming';
import type { Ticked } from '@/common/entry-offers';
import type {
  EntryAsked,
  EntryAt,
  EntryEdit,
  EntryTarget,
  InEntry,
  Newcomer
} from '@/common/operations';
import type { VolumeCitation } from '@/common/types';

import type { NewChange } from '../../changes/changes';
import type { openAppCitations } from '../app-citations';
import { viewerUrl } from '../astia/astia';
import type { Images } from '../images';
import type { createSupport } from '../support';
import { plainText } from '../text';
import { fieldsRefusal, keptFields } from './fields';
import { NewcomerRefused, newcomersRefusal } from './newcomers';
import type { entryNewcomers } from './newcomers';
import { openEntries } from './storage';
import type { EntryCitation, StoredEntry } from './storage';
import type { entryTree, Offered } from './tree';

export { CITATIONS_READ, dropUncitedEntries } from './storage';
export { gatherEntries, putEntryFields } from './gathering';
export { entryTree } from './tree';
export { entryNewcomers } from './newcomers';

export type { EntryAt, EntryEdit, InEntry } from '@/common/operations';

interface Refused {
  rejected: string;
}

// What the Entries read and write through the dataset's Citations.
interface EntryDeps<R> {
  made: ReturnType<typeof openAppCitations>;
  images: Images;
  // The archives an Image may be cited from.
  citable: () => Promise<string[]>;
  // The Citations linking into the Volume, as the Scan viewer lists them.
  inVolume: (volumeId: string) => Promise<VolumeCitation[]>;
  volumeArchive: (volumeId: string) => Promise<string | null>;
  personExists: (personId: number) => boolean;
  support: ReturnType<typeof createSupport>;
  // The Entry against the tree: what it would do to its owner's Facts.
  tree: ReturnType<typeof entryTree>;
  // Those it names who aren't in the tree yet, made with it.
  newcomers: ReturnType<typeof entryNewcomers>;
  changed: (change: NewChange) => void;
  // A Citation as the Scan viewer lists it.
  listed: (citationId: number) => Promise<VolumeCitation>;
  // Removes a Citation with its support and notes, writing its Change: it
  // as it was, or null when there's none.
  uncite: (citationId: number) => R | null;
}

function sameAt(a: EntryAt, b: StoredEntry) {
  return (
    a.volumeId === b.volumeId &&
    a.image === b.image &&
    a.fileId === b.fileId &&
    a.box.left === b.box.left &&
    a.box.top === b.box.top &&
    a.box.width === b.box.width &&
    a.box.height === b.box.height
  );
}

// Whether the edit changes whom the Entry names or how: its people, its
// Event, or the Image its Box is on. Only then are they checked again, so
// what an Entry made before says can be put as it is.
function renames(edit: EntryEdit, moved: boolean) {
  return edit.people !== undefined || edit.event !== undefined || moved;
}

// Whether someone named isn't a person: one in the tree, or a newcomer.
function unknown(people: InEntry[], personExists: (id: number) => boolean) {
  return people.some((p) => p.personId > 0 && !personExists(p.personId));
}

// The save run in its transaction, or why a part of it was refused.
function saved<T>(db: Database, save: () => T): T | Refused {
  try {
    return db.transaction(save)();
  } catch (err) {
    if (err instanceof NewcomerRefused) return { rejected: err.message };
    throw err;
  }
}

export function createEntries<R>(db: Database, deps: EntryDeps<R>) {
  const { made, images, citable, inVolume, volumeArchive, personExists } = deps;
  const { tree, newcomers, changed, listed, uncite } = deps;
  const stored = openEntries(db);

  // Why the people can't be named in an Entry of the Event on the Image
  // (common/entry-naming), or with another Citation linking the Image
  // than the Entry's own. `was` are those it named before. Null when
  // they can.
  async function refusal(
    at: { volumeId: string; image: number },
    event: EntryEvent | null,
    people: InEntry[],
    entry: { id: number; was: EntryCitation[] } | null
  ) {
    const before = entry?.was.map((c) => c.personId) ?? [];
    const refused = namingRefusal(event, people, before);
    if (refused !== null) return refused;
    const linking = citingImage(
      await inVolume(at.volumeId),
      at.image,
      entry?.id ?? null
    );
    return people.some((p) => linking.has(p.personId)) ? ALREADY_LINKED : null;
  }

  // Stores the person's Citation of the Entry, with its Change; its id.
  // It supports nothing of itself: only the lines ticked on the card do
  // (ADR-0033).
  function name(
    entryId: number,
    p: InEntry,
    at: { volume: string; image: number }
  ) {
    const id = made.cite(entryId, p.personId, p.role);
    changed({
      on: { citationId: id },
      what: { kind: 'cite', volume: at.volume, image: at.image }
    });
    return id;
  }

  // What the Entry would do to the tree, and whether the lines ticked are
  // among it: refused with why not.
  async function offeredFor(
    shape: Parameters<typeof tree.offered>[0],
    ticked: Ticked[]
  ): Promise<Offered | Refused> {
    const offered = await tree.offered(shape);
    const refused = tree.tickRefusal(offered, ticked);
    return refused === null ? offered : { rejected: refused };
  }

  // The fields the Entry keeps, what it would do to the tree with them,
  // and the lines ticked; refused where a date can't be read or a line
  // ticked isn't offered.
  async function saying(
    shape: Omit<Parameters<typeof tree.offered>[0], 'fields'>,
    given: EntryFields,
    ticked: Ticked[]
  ) {
    const fields = keptFields(shape.event, given);
    const wrong = fieldsRefusal(fields);
    if (wrong !== null) return { rejected: wrong };
    const offered = await offeredFor({ ...shape, fields }, ticked);
    return 'rejected' in offered ? offered : { fields, offered, ticked };
  }

  // What an Entry's card offered and had ticked.
  interface Lines {
    offered: Offered;
    ticked: Ticked[];
    untick?: boolean;
  }

  // Does the lines ticked for the Entry of the Event naming the people as
  // saved, by the owner's Citation of it. With `untick`, as an edit
  // sending its lines does, a Fact it supported whose line isn't ticked it
  // no longer does; an edit sending none leaves its support as it is.
  function doTicked(
    entryId: number,
    saved: { event: EntryEvent | null; people: InEntry[] },
    { offered, ticked, untick = false }: Lines
  ) {
    const citations = stored.citationsOf(entryId);
    tree.doTicked(saved, offered, ticked, {
      citationOf: (personId) =>
        citations.find((c) => c.personId === personId)!.id,
      citations: untick ? citations.map((c) => c.id) : []
    });
  }

  // The people with the newcomers made, and a marriage's couple a family.
  function madeNow(
    event: EntryEvent | null,
    people: InEntry[],
    those: Newcomer[] | undefined
  ) {
    return newcomers.make(event, people, those ?? []);
  }

  async function listedOf(entryId: number) {
    return await Promise.all(
      stored.citationsOf(entryId).map(async (c) => await listed(c.id))
    );
  }

  // Where the Entry would be after the move, its Box citable there; null
  // when it stays where it is.
  async function movedTo(
    entry: StoredEntry,
    at: EntryAt | undefined
  ): Promise<(EntryAt & { volume: string }) | Refused | null> {
    if (at === undefined || sameAt(at, entry)) return null;
    if (at.volumeId !== entry.volumeId) {
      return { rejected: 'An entry stays in its Volume.' };
    }
    const checked = await images.imageToCite(at, await citable());
    if ('rejected' in checked) return checked;
    return { ...at, ...checked };
  }

  // The Entry's people diffed with those it should name, by person.
  function diffed(was: EntryCitation[], people: InEntry[]) {
    return {
      added: people.filter((p) => !was.some((w) => w.personId === p.personId)),
      gone: was.filter((w) => !people.some((p) => p.personId === w.personId)),
      retyped: was.flatMap((w) => {
        const now = people.find((p) => p.personId === w.personId);
        return now === undefined || now.role === w.role ? [] : [{ w, now }];
      })
    };
  }

  // Moves the Entry and puts what it says, with a Change on each of its
  // Citations `kept`.
  function relocate(
    entryId: number,
    to: EntryAt & { volume: string },
    kept: EntryCitation[]
  ) {
    const { volumeId, volume, image, fileId, box } = to;
    const page = viewerUrl(volumeId, fileId);
    stored.move(entryId, { page, volumeId, volume, image, fileId, box });
    for (const c of kept) {
      changed({
        on: { citationId: c.id },
        what: { kind: 'move', volume, image }
      });
    }
  }

  function retext(
    entryId: number,
    text: string | null,
    at: { volume: string; image: number },
    kept: EntryCitation[]
  ) {
    stored.setText(entryId, text);
    for (const c of kept) {
      changed({
        on: { citationId: c.id },
        what: { kind: 'transcribe', volume: at.volume, image: at.image, text }
      });
    }
  }

  // The person's Role changed on their Citation, keeping it.
  function recast(
    c: EntryCitation,
    role: string | null,
    at: { volume: string; image: number }
  ) {
    stored.setRole(c.id, role);
    changed({
      on: { citationId: c.id },
      what: {
        kind: 'role',
        volume: at.volume,
        image: at.image,
        from: c.role,
        to: role
      }
    });
  }

  // Who the Entry names after the edit, the Event it records and where it
  // moves to, if it moves: its people checked where they, its Event or
  // its Box change. Null when someone named isn't a person.
  async function renamed(
    entryId: number,
    entry: StoredEntry,
    was: EntryCitation[],
    edit: EntryEdit
  ) {
    const people = edit.people ?? was;
    if (unknown(people, personExists)) return null;
    const to = await movedTo(entry, edit.at);
    if (to !== null && 'rejected' in to) return to;
    const event = edit.event ?? entry.event;
    if (renames(edit, to !== null)) {
      const at = to ?? entry;
      const refused = await refusal(at, event, people, { id: entryId, was });
      if (refused !== null) return { rejected: refused };
    }
    return { people, to, event };
  }

  // The edit checked as a whole, as it would be after: who it names, its
  // fields and the lines ticked. Null when someone named isn't a person.
  async function checked(
    entryId: number,
    entry: StoredEntry,
    was: EntryCitation[],
    edit: EntryEdit
  ) {
    const named = await renamed(entryId, entry, was, edit);
    if (named === null || 'rejected' in named) return named;
    const { people, to, event } = named;
    const fresh = newcomersRefusal(event, people, edit.newcomers ?? []);
    if (fresh !== null) return { rejected: fresh };
    const said = await saying(
      { volumeId: entry.volumeId, entryId, event, people },
      edit.fields ?? entry.fields,
      edit.ticked ?? []
    );
    if ('rejected' in said) return said;
    return { people, to, event, ...said };
  }

  // The Event the Entry records chosen anew, if it's another, with a
  // Change on each of its Citations `kept`.
  function rekind(
    entryId: number,
    { from, to }: { from: EntryEvent | null; to: EntryEvent | null },
    at: { volume: string; image: number },
    kept: EntryCitation[]
  ) {
    if (to === null || to === from) return;
    stored.setEvent(entryId, to);
    for (const c of kept) {
      changed({
        on: { citationId: c.id },
        what: { kind: 'event', volume: at.volume, image: at.image, from, to }
      });
    }
  }

  // Writes the edit checked: the Event first, then those named anew, so
  // the Entry is never left uncited, then those no longer named, then the
  // rest, each with its Changes.
  function write(
    entryId: number,
    e: Omit<StoredEntry, 'event'> & {
      was: EntryCitation[];
      people: InEntry[];
      to: (EntryAt & { volume: string }) | null;
      text: string | null | undefined;
      event: EntryEvent | null;
      wasEvent: EntryEvent | null;
      fields: EntryFields;
    }
  ) {
    const { was, people, to, text, event, wasEvent } = e;
    stored.setFields(entryId, e.fields);
    const { added, gone, retyped } = diffed(was, people);
    const kept = was.filter((w) => !gone.includes(w));
    const place = { ...e, image: to?.image ?? e.image };
    rekind(entryId, { from: wasEvent, to: event }, e, kept);
    for (const p of added) name(entryId, p, place);
    for (const w of gone) uncite(w.id);
    if (to !== null) relocate(entryId, to, kept);
    if (text !== undefined && was.some((c) => c.text !== text)) {
      retext(entryId, text, place, kept);
    }
    for (const { w, now } of retyped) recast(w, now.role, place);
  }

  return {
    // Makes an Entry of the Event at the Box with a Citation of it for
    // each person named, in their Role, and gives them as the Scan viewer
    // lists them. Null when one of them isn't a person; rejected where
    // the entry can't be cited there, or they can't be named in it.
    async make(
      at: Omit<EntryTarget, 'text'>,
      text: string | null,
      people: InEntry[]
    ): Promise<VolumeCitation[] | Refused | null> {
      if (unknown(people, personExists)) return null;
      if (people.length === 0) return { rejected: 'Name someone in it.' };
      const fresh = newcomersRefusal(at.event, people, at.newcomers ?? []);
      if (fresh !== null) return { rejected: fresh };
      const checked = await images.imageToCite(at, await citable());
      if ('rejected' in checked) return checked;
      const refused = await refusal(at, at.event, people, null);
      if (refused !== null) return { rejected: refused };
      const { event, volumeId } = at;
      const said = await saying(
        { volumeId, event, people },
        at.fields,
        at.ticked
      );
      if ('rejected' in said) return said;
      const { fields, offered, ticked } = said;
      const archive = await volumeArchive(at.volumeId);
      const ids = saved(db, () => {
        const now = madeNow(event, people, at.newcomers);
        const entryId = made.entry({
          ...at,
          ...checked,
          archive,
          text: plainText(text)
        });
        stored.setFields(entryId, fields);
        const entry = stored.entryOf(entryId)!;
        const named = now.map((p) => name(entryId, p, entry));
        doTicked(entryId, { event, people: now }, { offered, ticked });
        return named;
      });
      if ('rejected' in ids) return ids;
      return await Promise.all(ids.map(listed));
    },

    // What an Entry would do to the tree as it is now, the lines its card
    // lists (ADR-0033).
    async offers(asked: EntryAsked) {
      const fields = keptFields(asked.event, asked.fields);
      return (await tree.offered({ ...asked, fields })).offers;
    },

    // Changes the Entry to be as `edit` says, all of it or none: its Box
    // moved, what it says put, tidied, and the people it names diffed by
    // person. Those named anew get a Citation, those no longer named lose
    // theirs, and those whose Role changed keep theirs. Checked first as
    // it would be after, its people where they or its Box change. Its
    // Citations as the Scan viewer lists them; null when there's no such
    // Entry or someone named isn't a person, rejected as `make` is.
    async edit(
      entryId: number,
      edit: EntryEdit
    ): Promise<VolumeCitation[] | Refused | null> {
      const entry = stored.entryOf(entryId);
      if (entry === null) return null;
      const was = stored.citationsOf(entryId);
      const ok = await checked(entryId, entry, was, edit);
      if (ok === null || 'rejected' in ok) return ok;
      const text = edit.text === undefined ? undefined : plainText(edit.text);
      const done = saved(db, () => {
        const now = madeNow(ok.event, ok.people, edit.newcomers);
        const e = { ...entry, was, ...ok, people: now };
        write(entryId, { ...e, text, wasEvent: entry.event });
        const saved = { event: ok.event, people: now };
        doTicked(entryId, saved, {
          offered: ok.offered,
          ticked: ok.ticked,
          untick: edit.ticked !== undefined
        });
        return null;
      });
      if (done !== null) return done;
      return await listedOf(entryId);
    },

    // Removes a person's Citation of an Entry, with its Change; removing
    // the last removes the Entry. It as it was; null when it isn't a
    // Citation of an Entry.
    unname(citationId: number) {
      if (stored.ofCitation(citationId) === null) return null;
      return db.transaction(() => uncite(citationId))();
    },

    // Removes the Entry with all its Citations, each with its Change: how
    // many went; null when there's no such Entry.
    remove(entryId: number) {
      const ids = stored.citationsOf(entryId).map((c) => c.id);
      if (ids.length === 0) return null;
      db.transaction(() => {
        for (const id of ids) uncite(id);
      })();
      return ids.length;
    }
  };
}
