// Making an Entry in the Scan viewer with everyone it names, and naming
// someone in one later, or changing what it says (ADR-0026): one Box for all, a Citation of it for
// each, in their Role, with its Change and the support of the Fact the
// entry records for them.

import type { Database } from 'bun:sqlite';

import { entryRoles } from '@/common/books';
import type { Box, NewChange, VolumeCitation } from '@/common/types';

import type { openAppCitations } from './app-citations';
import { entryEvent } from './app-citations';
import type { Images } from './images';
import type { createSupport } from './support';

// Where an entry is cited in the app, and what it says.
export interface EntryTarget {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
  text: string | null;
}

// Someone named in an entry, and who they are in it: one of its Volume's
// entryRoles, or none.
export interface InEntry {
  personId: number;
  role: string | null;
}

// What making Entries reads and writes through the dataset's Citations.
interface EntryDeps {
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
}

// The text with its lines tidied: spaces collapsed, blank lines dropped;
// null for none.
export function plainText(text: string | null) {
  const lines = (text ?? '')
    .split('\n')
    .map((l) => l.replaceAll(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
  return lines.length === 0 ? null : lines.join('\n');
}

export function createEntryCitations(db: Database, deps: EntryDeps) {
  const { made, images, citable, inVolume, volumeArchive, personExists } = deps;
  const { support, changed, listed } = deps;

  // Why the people can't be named in an entry of the Volume on the Image:
  // a Role not one of its Book's, someone named twice, or someone whose
  // Citations already link the Image. Null when they can.
  async function refusal(
    at: { volumeId: string; image: number },
    volume: string,
    people: InEntry[]
  ) {
    const roles = entryRoles(volume).map((r) => r.role);
    if (people.some((p) => p.role !== null && !roles.includes(p.role))) {
      return "That isn't a Role in this kind of entry.";
    }
    const named = new Set(people.map((p) => p.personId));
    if (named.size < people.length) return 'Someone is named twice.';
    const there = await inVolume(at.volumeId);
    const linked = there?.some(
      (r) =>
        named.has(r.personId) && 'image' in r.link && r.link.image === at.image
    );
    return linked === true ? 'Their Citations already link this Image.' : null;
  }

  // Stores the person's Citation of the Entry, with its Change and the
  // support of the Fact the entry records for them; its id.
  function recordCitation(entryId: number, p: InEntry, volume: string) {
    const place = made.entryPlace(entryId)!;
    const id = made.cite(entryId, p.personId, p.role);
    changed({
      on: { citationId: id },
      what: { kind: 'cite', volume, image: place.image }
    });
    support.recorded(id, p.personId, entryEvent(volume), p.role);
    return id;
  }

  // Makes an Entry at the Box and a Citation of it for each person named,
  // in their Role (ADR-0026), and gives them as the Scan viewer lists
  // them. Null when one of them isn't a person; rejected where the entry
  // can't be cited, or as `refusal` says.
  async function citeEntry(
    target: EntryTarget,
    people: InEntry[]
  ): Promise<VolumeCitation[] | { rejected: string } | null> {
    if (people.some((p) => !personExists(p.personId))) {
      return null;
    }
    if (people.length === 0) return { rejected: 'Name someone in it.' };
    const checked = await images.imageToCite(target, await citable());
    if ('rejected' in checked) return checked;
    const refused = await refusal(target, checked.volume, people);
    if (refused !== null) return { rejected: refused };
    const archive = await volumeArchive(target.volumeId);
    const ids = db.transaction(() => {
      const entryId = made.entry({
        volumeId: target.volumeId,
        volume: checked.volume,
        archive,
        image: target.image,
        fileId: target.fileId,
        box: target.box,
        text: plainText(target.text)
      });
      return people.map((p) => recordCitation(entryId, p, checked.volume));
    })();
    return await Promise.all(ids.map(listed));
  }

  // Adds the person to the Entry, in their Role, and gives their new
  // Citation as the Scan viewer lists it. Null when there's no such Entry
  // or person; rejected as for `citeEntry`.
  async function addToEntry(
    entryId: number,
    person: InEntry
  ): Promise<VolumeCitation | { rejected: string } | null> {
    const place = made.entryPlace(entryId);
    if (place === null || !personExists(person.personId)) return null;
    const refused = await refusal(place, place.volume, [person]);
    if (refused !== null) return { rejected: refused };
    return await listed(recordCitation(entryId, person, place.volume));
  }

  // Puts what the Entry says, tidied, with a Change on its first
  // Citation; what it says now. Null when there's no such Entry.
  function transcribe(entryId: number, text: string | null) {
    const place = made.entryPlace(entryId);
    const [first] = made.entryCitations(entryId);
    if (place === null || first === undefined) return null;
    const now = plainText(text);
    made.transcribe(entryId, now);
    changed({
      on: { citationId: first },
      what: {
        kind: 'transcribe',
        volume: place.volume,
        image: place.image,
        text: now
      }
    });
    return { text: now };
  }

  return { citeEntry, addToEntry, transcribe };
}
