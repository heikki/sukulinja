import { expect, test } from 'bun:test';

import { chartWords, systemFor } from './run';
import type { TreeView } from './tree-view';

test('tells Claude the living are left out, unless they are included', () => {
  expect(systemFor('terse')).toContain('may be living are left out');
  expect(systemFor('terse', true)).not.toContain('may be living');
  expect(systemFor('thorough', true)).toContain('Answer thoroughly');
});

// A view of people 1… with the chart drawing `onChart`; 3 may be living.
function viewOf(onChart: number[]) {
  return {
    onScreen: { personId: 1, onChart },
    hidden: (id: number) => id === 3,
    ref: (id: number) => ({ id, name: `P${id}`, born: 1800, died: 1860 })
  } as unknown as TreeView;
}

test("names everyone on the chart, counting who's left out", () => {
  expect(chartWords(viewOf([]))).toBeNull();
  expect(chartWords(viewOf([1, 2, 3]))).toBe(
    'On the chart (1 who may be living left out): ' +
      '[{"id":1,"name":"P1","born":1800,"died":1860},' +
      '{"id":2,"name":"P2","born":1800,"died":1860}]'
  );
  const many = Array.from({ length: 200 }, (_, i) => i + 10);
  expect(chartWords(viewOf(many))).toContain('"name":"P209"');
});
