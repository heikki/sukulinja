// Reading back what an Entry says from the NOTEs the export wrote on each
// of its citations (gedcom/entry-notes.ts, ADR-0033). The NOTEs read are
// taken off the citation, so its own notes are read without them; once
// the citations are gathered into Entries, each Entry gets what its
// citations said.

import { NO_FIELDS } from '@/common/entry-events';
import type { EntryFields } from '@/common/entry-events';

import { entryNoteOf } from '../gedcom/entry-notes';
import { findChildren } from '../gedcom/parser';
import type { GedNode } from '../gedcom/parser';
import type { LineReader } from './unstored';

export function entryNotesReader({ use }: LineReader) {
  // What each citation said, by its id.
  const said = new Map<number, EntryFields>();

  return {
    // What the citation's NOTEs say of its Entry, taken off it; null for
    // nothing.
    read(sour: GedNode): EntryFields | null {
      const fields: EntryFields = { ...NO_FIELDS };
      let any = false;
      for (const note of findChildren(sour, 'NOTE')) {
        const read = note.value === undefined ? null : entryNoteOf(note.value);
        if (read === null) continue;
        fields[read[0]] = read[1];
        any = true;
        use(note);
        sour.children.splice(sour.children.indexOf(note), 1);
      }
      return any ? fields : null;
    },

    // The citation stored as `citationId` said these.
    keep(citationId: number, fields: EntryFields | null) {
      if (fields !== null) said.set(citationId, fields);
    },

    // What each citation said, by its id.
    said: () => said
  };
}
