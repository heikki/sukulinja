// The estimates on an Image matched on request, as the Scan viewer asks
// (ADR-0029): all of them in one question about that Image, those not
// found then about each Image around it, each answer checked as the
// matcher checks one, and the Match saved where it
// confirms one. The person still confirms or discards it in the Scan
// viewer; nothing is Marked.

import type { LinkResolution } from '@/common/types';

import type { ImageRef } from '../../astia/astia';
import type { ChurchBookRef } from '../record';
import type { Scans } from '../scans';
import { around, personOf } from './matcher';
import type { MissReason } from './matcher';
import { confirms } from './reader';
import type { EntryReading, Person, Reader } from './reader';

// What the search did: the reference's Links as they then resolve, and
// null when a Match was saved, else why none was.
export interface Found {
  resolution: LinkResolution;
  missed: string | null;
}

// Every reference estimated on the Image `at`, looked for there in one
// question (ADR-0029), then those not found on the Images around it, one
// question for each Image, nearest first, as far as the matcher's
// Confirmation looks: each one's Links as they then resolve, and null
// where a Match was saved, else why none was.
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
  // Why each found none so far; none yet for one not read at all.
  const missed = new Map<Asking, string | null>(
    asking.flatMap((a) => (a.missed === null ? [] : [[a, a.missed]]))
  );
  let pending = asking.filter((a) => a.missed === null);
  const images = Math.max(0, ...pending.map((a) => a.images));
  for (const image of around(at.image, images)) {
    if (pending.length === 0) break;
    const on = { volumeId: at.volumeId, image };
    // eslint-disable-next-line no-await-in-loop -- nearest first, stop when all are found
    const readings = await findEntries(
      on,
      pending.map((a) => a.person)
    );
    const still: Searched[] = [];
    for (const [i, a] of pending.entries()) {
      const reading = readings[i]!;
      // eslint-disable-next-line no-await-in-loop -- one save after another
      const done = await saved(scans, on, a, reading);
      if (done === undefined) {
        still.push(a);
        if (!('unreadable' in reading)) missed.set(a, 'name not found');
      } else {
        missed.set(a, done);
      }
    }
    pending = still;
  }
  return await Promise.all(
    asking.map(async (a) => {
      const why = missed.get(a);
      return {
        resolution: await scans.resolveRef(a.ref),
        missed: why === undefined ? 'unreadable' : why
      };
    })
  );
}

// A reference's person, its Volume's label and count of Images, or why it
// isn't asked about.
interface Searched {
  ref: ChurchBookRef;
  missed: null;
  person: Person;
  volume: string;
  images: number;
}
type Asking = Searched | { ref: ChurchBookRef; missed: MissReason };

async function askingOf(
  scans: Scans,
  at: ImageRef,
  ref: ChurchBookRef
): Promise<Asking> {
  if (ref.name === null) return { ref, missed: 'no name' };
  const candidates = await scans.matchCandidates(ref);
  const c = candidates.find((v) => v.volumeId === at.volumeId);
  if (c === undefined) return { ref, missed: 'no candidate volume' };
  const person = personOf(ref, ref.name);
  return { ref, missed: null, person, volume: c.volume, images: c.images };
}

// Saves the Match a reading on `at` confirms: null when it did, else why
// not; undefined where the person isn't found there, to look further.
async function saved(
  scans: Scans,
  at: ImageRef,
  { ref, person, volume }: Searched,
  reading: EntryReading
) {
  if (!confirms(person, reading)) return undefined;
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
      findEntry: counted(reader.findEntry),
      ...(reader.findEntries === undefined
        ? {}
        : { findEntries: counted(reader.findEntries) })
    } satisfies Reader,
    asked: () => asked
  };
}
