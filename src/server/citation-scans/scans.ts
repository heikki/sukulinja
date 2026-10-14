// Astia scan links for church-book citations, resolved on demand with the
// anchors that ship with the app.

import type { ScanResolution } from '@common/types';

import anchorsJson from './anchors.json';
import { resolveCitation } from './locate';
import type { Anchors } from './locate';
import { CHURCH_COLLECTIONS, collectionOf, parseCitation } from './record';

const anchors = anchorsJson as Anchors;

export function isChurchBook(page: string | null): page is string {
  const collection = page === null ? null : collectionOf(page);
  return collection !== null && CHURCH_COLLECTIONS.has(collection);
}

export async function resolveScans(
  page: string,
  text: string | null
): Promise<ScanResolution> {
  try {
    return await resolveCitation(parseCitation(page, text ?? ''), anchors);
  } catch {
    return { error: 'Astia unavailable' };
  }
}
