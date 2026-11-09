// MyHeritage's Church-book references as the References port gives them
// to the rest of the Citations (../references.ts): read from a citation's
// page and text, resolved and saved through the dataset's Scans.

import type { References } from '../references';
import { churchBookRefOf, markKey, readRecord } from './record';
import type { ChurchBookRef } from './record';
import type { Scans } from './scans';

// A MyHeritage record's page: its text is the record's transcription.
function isRecordPage(page: string | null) {
  return page !== null && /^https?:/.test(page) && page.includes('myheritage.');
}

export function referencesOf(scans: Scans): References<ChurchBookRef> {
  return {
    refOf: ({ page, text }) => churchBookRefOf(page, text),
    markKey,
    recordOf: ({ page, text }) =>
      isRecordPage(page) ? readRecord(text ?? '') : null,
    resolve: scans.resolveRef,
    stamp: scans.stamp,
    volumeLinks: async (volumeId, refs) =>
      await scans.volumeLinks(volumeId, refs),
    mark: async (ref, target) => await scans.markRef(ref, target),
    discard: async (ref, at) => await scans.discardRef(ref, at),
    volumeChoices: async (ref) => await scans.volumeChoices(ref)
  };
}
