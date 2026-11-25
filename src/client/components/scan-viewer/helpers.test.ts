import { expect, test } from 'bun:test';

import { NO_TYPED } from '@/client/state';
import type { PendingChange } from '@/client/state';
import type { Box, VolumeCitation } from '@/common/types';

import { rowsShown } from './helpers';

const BOX: Box = { left: 0, top: 0.5, width: 1, height: 0.05 };

// A row Marked at BOX on Image 3, sharing its Mark with those of the same
// markKey, in the Entry `entryId`.
function row(id: number, markKey: string, entryId: number | null = null) {
  return {
    personId: id,
    citation: {
      id,
      source: null,
      reference: 'Juva · Syntyneet 1790–1796 · p. 12',
      entry: 'p. 12',
      referenceEntry: 'p. 12',
      page: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: true,
      markKey,
      citedPage: 12,
      cited: null,
      supports: [],
      entryId,
      event: null,
      fields: null,
      role: null
    },
    link: {
      volumeId: 'v1',
      volume: 'I C:1',
      url: 'astia/1',
      archive: 'Juvan seurakunnan arkisto',
      precision: 'entry',
      image: 3,
      box: BOX,
      certainty: 'marked'
    }
  } satisfies VolumeCitation;
}

const AT = { volumeId: 'v1', volume: 'I C:1', image: 3, box: BOX } as const;

function ids(rows: VolumeCitation[]) {
  return rows.map((r) => r.citation.id);
}

test("a Mark hides the Box of everyone sharing the source's Mark", () => {
  const rows = [row(1, 'a'), row(2, 'a'), row(3, 'b')];
  const pending: PendingChange = { ...AT, kind: 'mark' };
  expect(ids(rowsShown(rows, rows[0] ?? null, pending))).toEqual([3]);
});

test('an edited Entry hides the Box of everyone in it', () => {
  const rows = [row(1, 'a', 7), row(2, 'b', 7), row(3, 'c', 8)];
  const was = [1, 2].map((id) => ({
    personId: id,
    role: null,
    citationId: id
  }));
  const pending: PendingChange = {
    ...AT,
    kind: 'edit',
    cite: {
      event: null,
      people: [],
      text: '',
      fields: NO_TYPED,
      ticks: {},
      newcomers: []
    },
    editing: { entryId: 7, event: null, was, text: '', box: BOX }
  };
  expect(ids(rowsShown(rows, rows[0] ?? null, pending))).toEqual([3]);
});

test('a new Entry hides no Box', () => {
  const rows = [row(1, 'a'), row(2, 'b')];
  const pending: PendingChange = {
    ...AT,
    kind: 'new',
    cite: {
      event: null,
      people: [],
      text: '',
      fields: NO_TYPED,
      ticks: {},
      newcomers: []
    }
  };
  expect(ids(rowsShown(rows, rows[0] ?? null, pending))).toEqual([1, 2]);
});
