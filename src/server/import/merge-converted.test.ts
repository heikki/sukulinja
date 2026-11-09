import { expect, test } from 'bun:test';

import {
  citations,
  convert,
  CONVERTED,
  importTree,
  MATTI,
  PAGE,
  PLAIN,
  registry,
  remind,
  tree,
  useDataFolder
} from './merge-testing';

useDataFolder();

test('a converted Citation stands for its reference in the export', async () => {
  await importTree(tree([MATTI]));
  convert('@I1@', PAGE.a);
  const outcome = await importTree(tree([MATTI]));
  expect(citations()).toEqual([{ xref: '@I1@', ...CONVERTED }]);
  expect(outcome.merged).toMatchObject({
    citations: { added: 0, gone: 0 },
    kept: { marks: 0, citations: 0, converted: 1 },
    lost: []
  });
  const kept = registry()
    .open('tree')
    .query(
      'SELECT s.title, c.text FROM citations c JOIN sources s ON s.id = c.source_id'
    )
    .all();
  expect(kept).toEqual([{ title: 'Juva 1790-1796', text: 'Matti Esimerkki' }]);
});

test('a converted Citation stays when the export no longer has its reference', async () => {
  await importTree(tree([MATTI]));
  convert('@I1@', PAGE.a);
  const outcome = await importTree(tree([{ ...MATTI, pages: [PAGE.c] }]));
  expect(citations()).toEqual([
    { xref: '@I1@', page: PAGE.c, ...PLAIN, added_in_app: 0 },
    { xref: '@I1@', ...CONVERTED }
  ]);
  expect(outcome.merged?.kept).toMatchObject({ citations: 1, converted: 0 });
});

test('of references alike, a converted Citation stands for one', async () => {
  await importTree(tree([{ ...MATTI, pages: [PAGE.a, PAGE.a] }]));
  convert('@I1@', PAGE.a);
  await importTree(tree([{ ...MATTI, pages: [PAGE.a, PAGE.a] }]));
  expect(citations()).toEqual([
    { xref: '@I1@', page: PAGE.a, ...PLAIN, added_in_app: 0 },
    { xref: '@I1@', ...CONVERTED }
  ]);
});

test('a Reminder on a converted Citation stays on it', async () => {
  await importTree(tree([MATTI]));
  remind('Check the household', '@I1@', convert('@I1@', PAGE.a));
  await importTree(tree([MATTI]));
  const on = registry()
    .open('tree')
    .query(
      'SELECT r.text, c.added_in_app FROM reminders r JOIN citations c ON c.id = r.citation_id'
    )
    .all();
  expect(on).toEqual([{ text: 'Check the household', added_in_app: 1 }]);
});
