// The Entry (ADR-0026): one record written in a church book, on one Image,
// with its Box, its Event and its Transcription, held once for everyone
// whose Citation cites it, each in their Role. Only the app's Citations of
// an Image cite one; a Church-book reference keeps its link on its citation
// until `citations/myheritage/` goes. An Entry is made, edited, and has
// someone unnamed or is removed here, each in one transaction with its
// Changes; storage, the Roles the tree tells and the gathering beside it.

import type { Database } from 'bun:sqlite';

import {
  ALREADY_LINKED,
  citingImage,
  namingRefusal
} from '@/common/entry-naming';
import type { EntryAt, EntryEdit, InEntry } from '@/common/operations';
import type { NewChange, VolumeCitation } from '@/common/types';

import type { openAppCitations } from '../app-citations';
import { viewerUrl } from '../astia/astia';
import type { Images } from '../images';
import type { createSupport } from '../support';
import { plainText } from '../text';
import { openEntries } from './storage';
import type { EntryCitation, StoredEntry } from './storage';

export { CITATIONS_READ, dropUncitedEntries } from './storage';
export { gatherEntries } from './gathering';

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
  inVolume: (volumeId: string) => Promise<VolumeCitation[] | null>;
  volumeArchive: (volumeId: string) => Promise<string | null>;
  personExists: (personId: number) => boolean;
  support: ReturnType<typeof createSupport>;
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

export function createEntries<R>(db: Database, deps: EntryDeps<R>) {
  const { made, images, citable, inVolume, volumeArchive, personExists } = deps;
  const { support, changed, listed, uncite } = deps;
  const stored = openEntries(db);

  // Why the people can't be named in an entry of the Volume on the Image
  // (common/entry-naming), or with another Citation linking the Image
  // than the Entry's own. Null when they can.
  async function refusal(
    at: { volumeId: string; image: number },
    volume: string,
    people: InEntry[],
    entryId: number | null
  ) {
    const refused = namingRefusal(volume, people);
    if (refused !== null) return refused;
    const linking = citingImage(
      (await inVolume(at.volumeId)) ?? [],
      at.image,
      entryId
    );
    return people.some((p) => linking.has(p.personId)) ? ALREADY_LINKED : null;
  }

  // Stores the person's Citation of the Entry, with its Change and the
  // support of the Fact the entry records for them; its id.
  function name(
    entryId: number,
    p: InEntry,
    at: { volume: string; image: number; event: string | null }
  ) {
    const id = made.cite(entryId, p.personId, p.role);
    changed({
      on: { citationId: id },
      what: { kind: 'cite', volume: at.volume, image: at.image }
    });
    support.recorded(id, p.personId, at.event, p.role);
    return id;
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

  // The person's Role changed on their Citation, keeping it, with the
  // support the new Role plainly gives added.
  function recast(
    c: EntryCitation,
    role: string | null,
    at: { volume: string; image: number; event: string | null }
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
    support.recorded(c.id, c.personId, at.event, role);
  }

  // Who the Entry names after the edit and where it moves to, if it
  // moves, checked as it would be after: its people where they or its Box
  // change. Null when someone named isn't a person.
  async function checked(
    entryId: number,
    entry: StoredEntry,
    was: EntryCitation[],
    edit: EntryEdit
  ) {
    const people = edit.people ?? was;
    if (people.some((p) => !personExists(p.personId))) return null;
    const to = await movedTo(entry, edit.at);
    if (to !== null && 'rejected' in to) return to;
    if (edit.people !== undefined || to !== null) {
      const at = to ?? entry;
      const refused = await refusal(at, entry.volume, people, entryId);
      if (refused !== null) return { rejected: refused };
    }
    return { people, to };
  }

  // Writes the edit checked: those named anew first, so the Entry is never
  // left uncited, then those no longer named, then the rest, each with
  // its Changes.
  function write(
    entryId: number,
    e: StoredEntry & {
      was: EntryCitation[];
      people: InEntry[];
      to: (EntryAt & { volume: string }) | null;
      text: string | null | undefined;
    }
  ) {
    const { was, people, to, text } = e;
    const { added, gone, retyped } = diffed(was, people);
    const kept = was.filter((w) => !gone.includes(w));
    const place = { ...e, image: to?.image ?? e.image };
    for (const p of added) name(entryId, p, place);
    for (const w of gone) uncite(w.id);
    if (to !== null) relocate(entryId, to, kept);
    if (text !== undefined && was.some((c) => c.text !== text)) {
      retext(entryId, text, place, kept);
    }
    for (const { w, now } of retyped) recast(w, now.role, place);
  }

  return {
    // Makes an Entry at the Box with a Citation of it for each person
    // named, in their Role, and gives them as the Scan viewer lists them.
    // Null when one of them isn't a person; rejected where the entry can't
    // be cited there, or they can't be named in it.
    async make(
      at: EntryAt,
      text: string | null,
      people: InEntry[]
    ): Promise<VolumeCitation[] | Refused | null> {
      if (people.some((p) => !personExists(p.personId))) return null;
      if (people.length === 0) return { rejected: 'Name someone in it.' };
      const checked = await images.imageToCite(at, await citable());
      if ('rejected' in checked) return checked;
      const refused = await refusal(at, checked.volume, people, null);
      if (refused !== null) return { rejected: refused };
      const archive = await volumeArchive(at.volumeId);
      const ids = db.transaction(() => {
        const entryId = made.entry({
          ...at,
          ...checked,
          archive,
          text: plainText(text)
        });
        const entry = stored.entryOf(entryId)!;
        return people.map((p) => name(entryId, p, entry));
      })();
      return await Promise.all(ids.map(listed));
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
      db.transaction(() => {
        write(entryId, { ...entry, was, ...ok, text });
      })();
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
