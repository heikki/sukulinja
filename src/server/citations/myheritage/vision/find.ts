// One reference matched on request, as the Scan viewer asks (ADR-0029):
// the matcher over the Volumes its estimate offers, as the scripts run it,
// and the Match saved where it confirms one. The person still confirms or
// discards it in the Scan viewer; nothing is Marked.

import type { LinkResolution } from '@/common/types';

import type { ChurchBookRef } from '../record';
import type { Scans } from '../scans';
import { matchRef } from './matcher';
import type { Reader } from './reader';

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
      findEntry: counted(reader.findEntry)
    } satisfies Reader,
    asked: () => asked
  };
}
