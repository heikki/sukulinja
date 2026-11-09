import { expect, test } from 'bun:test';

import {
  ASTIA,
  citations,
  convert,
  CONVERTED,
  importTree,
  MAIJA,
  MATTI,
  PAGE,
  PLAIN,
  registry,
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

const RECORD =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=5001&action=showRecord';
const OTHER =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=5002&action=showRecord';

test("a new person's citation of a converted record converts at import", async () => {
  await importTree(tree([{ ...MATTI, pages: [RECORD] }]));
  convert('@I1@', RECORD);
  const outcome = await importTree(
    tree([
      { ...MATTI, pages: [RECORD] },
      { ...MAIJA, pages: [RECORD, OTHER] }
    ])
  );
  const marked = { page: ASTIA, original_page: RECORD, link_image: 12 };
  // The export's own first, then the converted Citation reattached.
  expect(citations()).toEqual([
    { xref: '@I2@', ...marked, link_box_left: 10, added_in_app: 1 },
    { xref: '@I2@', page: OTHER, ...PLAIN, added_in_app: 0 },
    { xref: '@I1@', ...marked, link_box_left: 10, added_in_app: 1 }
  ]);
  expect(outcome.merged?.kept.converted).toBe(2);
});
