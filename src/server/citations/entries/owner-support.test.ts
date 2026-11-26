// An Entry's Citation supports only its owner's Facts (ADR-0037), whoever
// sets it: a baptism's child's, a marriage's couple's family's by either
// spouse's Citation, a burial's one person's. Support made before the rule
// is still taken back. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';

import { NOT_OWNERS, unownedSupport } from '../support';
import { at, baptism, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-owner-support-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const refused = { rejected: NOT_OWNERS };

// Matti (1) and Liisa (2), family 1, with their Marriage (Fact 3); Juho (3)
// with a Birth (Fact 4).
function dataset() {
  const d = entriesDataset(dir);
  d.db.run(`INSERT INTO facts (id, scope_type, scope_id, tag, date_text)
    VALUES (3, 'family', 1, 'MARR', '1820'), (4, 'person', 3, 'BIRT', NULL)`);
  return d;
}

test("a baptism's child's Citation supports their Facts, the parents' none", async () => {
  const { citations, entries } = dataset();
  const rows = made(
    await entries.make(baptism(3), null, [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const [matti, liisa] = rows.map((r) => r.citation.id) as [number, number];
  expect(citations.support(matti, 1, true)).toMatchObject({ supports: [1] });
  // Not his marriage's, nor his mother's own.
  expect(citations.support(matti, 3, true)).toEqual(refused);
  expect(citations.support(liisa, 3, true)).toEqual(refused);
  // Nor anyone else's.
  expect(citations.support(matti, 4, true)).toEqual(refused);
  expect(citations.supportRefusal(liisa, { scope: 'person', id: 2 })).toBe(
    NOT_OWNERS
  );
  expect(citations.supportRefusal(matti, { scope: 'person', id: 1 })).toBe(
    null
  );
  // Their own Citations, of no Entry, support as before.
  expect(citations.support(2, 3, true)).toMatchObject({ supports: [3] });
  expect(citations.supportRefusal(2, { scope: 'family', id: 1 })).toBe(null);
});

test("a marriage's Citations support the couple's family's Facts only", async () => {
  const { citations, entries } = dataset();
  const rows = made(
    await entries.make(
      { ...at(5), event: 'MARR', fields: NO_FIELDS, ticked: [] },
      null,
      [
        { personId: 1, role: 'HUSB' },
        { personId: 2, role: 'WIFE' }
      ]
    )
  );
  const [matti, liisa] = rows.map((r) => r.citation.id) as [number, number];
  expect(citations.support(liisa, 3, true)).toMatchObject({ supports: [3] });
  expect(citations.support(matti, 3, true)).toMatchObject({ supports: [3] });
  expect(citations.support(matti, 1, true)).toEqual(refused);
});

test("a burial's one person's Citation supports their Facts", async () => {
  const { citations, entries } = dataset();
  const rows = made(
    await entries.make(
      { ...at(7), event: 'BURI', fields: NO_FIELDS, ticked: [] },
      null,
      [{ personId: 1, role: null }]
    )
  );
  const matti = rows[0]!.citation.id;
  expect(citations.support(matti, 2, true)).toMatchObject({ supports: [2] });
  expect(citations.support(matti, 3, true)).toEqual(refused);
});

test('support made before the rule is found, and taken back with a Change', async () => {
  const { db, citations, entries, changes } = dataset();
  const rows = made(
    await entries.make(baptism(3), null, [
      { personId: 1, role: 'FATH' },
      { personId: 3, role: 'CHIL' }
    ])
  );
  const [matti, juho] = rows.map((r) => r.citation.id) as [number, number];
  db.run('INSERT INTO fact_citations (fact_id, citation_id) VALUES (1, ?)', [
    matti
  ]);
  db.run('INSERT INTO fact_citations (fact_id, citation_id) VALUES (4, ?)', [
    juho
  ]);
  expect(unownedSupport(db)).toEqual([{ citationId: matti, factId: 1 }]);
  changes.length = 0;
  expect(citations.support(matti, 1, false)).toMatchObject({ supports: [] });
  expect(unownedSupport(db)).toEqual([]);
  expect(changes).toEqual([
    {
      on: { citationId: matti },
      what: { kind: 'support', did: 'remove', tag: 'BIRT', fact: '3.3.1795' }
    }
  ]);
});

// MyHeritage's record of no kind the app makes, as the import gathers it:
// no owner known, so the person's rule.
test("an Entry of a kind the app doesn't make supports as a person's Citation", async () => {
  const { db, citations, entries } = dataset();
  const rows = made(
    await entries.make(baptism(3), null, [
      { personId: 1, role: 'FATH' },
      { personId: 3, role: 'CHIL' }
    ])
  );
  const matti = rows[0]!.citation.id;
  db.run("UPDATE entries SET event = 'Record'");
  db.run('INSERT INTO fact_citations (fact_id, citation_id) VALUES (3, ?)', [
    matti
  ]);
  expect(unownedSupport(db)).toEqual([]);
  expect(citations.support(matti, 1, true)).toMatchObject({ supports: [1, 3] });
});
