import { expect, test } from 'bun:test';

import type { VolumesRow } from '@/common/types';

import { pagesItems } from './pages-menu';
import type { PagesActions } from './pages-menu';

function row(pages: VolumesRow['pages']): VolumesRow {
  return {
    id: '1',
    label: 'I Aa:1',
    kind: null,
    years: null,
    digitized: true,
    onDisk: { images: 4, cached: 0, bytes: 0 },
    download: null,
    archiveId: 'a',
    archive: 'Juva',
    onList: true,
    cited: 0,
    added: true,
    pages,
    offloaded: null,
    steps: { move: null, trash: null }
  };
}

function actions(model: string | null): PagesActions {
  return {
    model,
    mark: () => undefined,
    survey: () => undefined,
    clear: () => undefined
  };
}

function labels(pages: VolumesRow['pages'], model: string | null = null) {
  return pagesItems(row(pages), { x: 0, y: 0 }, actions(model)).map(
    (i) => i.label
  );
}

test('page numbers not marked: surveyed with the Assistant on, cleared once read, or marked', () => {
  expect(labels('counted', 'Haiku 5.5')).toEqual([
    'Survey page numbers',
    'Mark page numbers checked',
    'Mark as no page numbers'
  ]);
  expect(labels('read')).toEqual([
    'Clear page numbers',
    'Mark page numbers checked',
    'Mark as no page numbers'
  ]);
});

test('marked, they are only unmarked', () => {
  expect(labels('checked', 'Haiku 5.5')).toEqual([
    'Unmark page numbers checked'
  ]);
  expect(labels('none')).toEqual(['Unmark no page numbers']);
});
