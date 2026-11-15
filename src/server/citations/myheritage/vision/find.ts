// One reference matched on request, as the Scan viewer asks (ADR-0029):
// the matcher over the Volumes its estimate offers, as the scripts run it,
// and the Match saved where it confirms one. The person still confirms or
// discards it in the Scan viewer; nothing is Marked.

import type { LinkResolution } from '@/common/types';

import type { ImageRef } from '../../astia/astia';
import type { ChurchBookRef } from '../record';
import type { Scans } from '../scans';
import { matchRef, personOf } from './matcher';
import type { MissReason } from './matcher';
import { confirms } from './reader';
import type { EntryReading, Person, Reader } from './reader';

// What the search did: the reference's Links as they then resolve, and
// null when a Match was saved, else why none was.
export interface Found {
  resolution: LinkResolution;
  missed: string | null;
}

export async function findByVision(
  scans: Scans,
  ref: ChurchBookRef,
  reader: Reader
): Promise<Found | { rejected: string }> {
  const match = await matchRef(ref, await scans.matchCandidates(ref), reader);
  if (!match.confirmed) {
    return { resolution: await scans.resolveRef(ref), missed: match.reason };
  }
  const refused = await scans.saveMatch(ref, match);
  if (refused !== null) return refused;
  return { resolution: await scans.resolveRef(ref), missed: null };
}

// Why one asked about with the others found no Match, from its reading.
function missOf(reading: EntryReading): MissReason {
  if ('unreadable' in reading) return 'unreadable';
  return 'name not found';
}

// Every reference estimated on the Image `at`, looked for there in one
// question (ADR-0029): each one's Links as they then resolve, and null
// where a Match was saved, else why none was. Only that Image is read, not
// those around it, as the matcher's Confirmation does.
export async function findAllOnImage(
  scans: Scans,
  at: ImageRef,
  refs: ChurchBookRef[],
  reader: Reader
): Promise<Found[]> {
  const { findEntries } = reader;
  if (findEntries === undefined) throw new Error('No reader for all at once');
  const asking = await Promise.all(
    refs.map(async (ref) => await askingOf(scans, at, ref))
  );
  const people = asking.flatMap((a) => (a.missed === null ? [a.person] : []));
  const readings = people.length === 0 ? [] : await findEntries(at, people);
  let next = 0;
  const found: Found[] = [];
  for (const a of asking) {
    // eslint-disable-next-line no-await-in-loop -- one save after another
    const missed = a.missed ?? (await saved(scans, at, a, readings[next++]!));
    // eslint-disable-next-line no-await-in-loop -- after its save
    found.push({ resolution: await scans.resolveRef(a.ref), missed });
  }
  return found;
}

// A reference's person and Volume label, or why it isn't asked about.
type Asking = { ref: ChurchBookRef } & (
  { missed: null; person: Person; volume: string } | { missed: MissReason }
);

async function askingOf(
  scans: Scans,
  at: ImageRef,
  ref: ChurchBookRef
): Promise<Asking> {
  if (ref.name === null) return { ref, missed: 'no name' };
  const candidates = await scans.matchCandidates(ref);
  const c = candidates.find((v) => v.volumeId === at.volumeId);
  if (c === undefined) return { ref, missed: 'no candidate volume' };
  return {
    ref,
    missed: null,
    person: personOf(ref, ref.name),
    volume: c.volume
  };
}

// Saves the Match a reading confirms: null when it did, else why not.
async function saved(
  scans: Scans,
  at: ImageRef,
  { ref, person, volume }: Asking & { missed: null },
  reading: EntryReading
) {
  if (!confirms(person, reading)) return missOf(reading);
  const box = 'unreadable' in reading ? null : (reading.box ?? null);
  if (box === null) return 'no box';
  const match = { confirmed: true as const, ...at, volume, onCitedPage: false };
  const refused = await scans.saveMatch(ref, { ...match, box });
  return refused === null ? null : refused.rejected;
}

// The reader, counting the questions asked of it.
export function counting(reader: Reader) {
  let asked = 0;
  function counted<A extends unknown[], T>(ask: (...a: A) => Promise<T>) {
    return async (...a: A) => {
      asked += 1;
      return await ask(...a);
    };
  }
  return {
    reader: {
      ...reader,
      pageNumbers: counted(reader.pageNumbers),
      dates: counted(reader.dates),
      findEntry: counted(reader.findEntry),
      ...(reader.findEntries === undefined
        ? {}
        : { findEntries: counted(reader.findEntries) })
    } satisfies Reader,
    asked: () => asked
  };
}
