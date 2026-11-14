// A Citation supporting its person's Facts (ADR-0022): which Fact a new
// one's entry records, adding and taking back support with its Change, and
// support going with a spouse who leaves the family.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewChange } from '@/common/types';

import { openDb } from '../datasets/db';
import { leaveFamily } from '../persons/membership';
import { createTree } from '../tree';
import { fileId } from './astia/memory-astia';
import { memoryParishes } from './astia/parishes';
import { juvaAstia } from './astia/test-parish';
import { createCitations } from './citations';
import { openImages } from './images';
import { referencesFor } from './myheritage/test-pins';
import { entryFact } from './support';

describe('entryFact', () => {
  const chr = { id: 1, tag: 'CHR', familyId: null };
  const birth = { id: 2, tag: 'BIRT', familyId: null };
  const marriage = { id: 3, tag: 'MARR', familyId: 7 };

  test("a baptism's child: their Christening, else their Birth", () => {
    expect(entryFact('CHR', 'CHIL', [birth, chr])).toBe(chr);
    expect(entryFact('CHR', 'CHIL', [birth])).toBe(birth);
    expect(entryFact('CHR', 'CHIL', [chr, { ...chr, id: 4 }, birth])).toBe(
      null
    );
  });

  test("a marriage's spouse: their one marriage", () => {
    expect(entryFact('MARR', 'WIFE', [birth, marriage])).toBe(marriage);
    expect(
      entryFact('MARR', 'HUSB', [marriage, { ...marriage, id: 5, familyId: 8 }])
    ).toBe(null);
  });

  test('anyone else in an entry, or a household line, supports nothing', () => {
    expect(entryFact('CHR', 'FATH', [chr, birth])).toBe(null);
    expect(entryFact('CHR', null, [chr])).toBe(null);
    expect(entryFact('RESI', null, [chr])).toBe(null);
    expect(entryFact(null, 'CHIL', [chr])).toBe(null);
  });
});

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'support-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Matti (1) and Liisa (2), married in family 1; Juho (3) in no family.
// Matti has a Birth (1) and a Christening (2), the marriage is Fact 3,
// Juho's Birth Fact 4. Each has a Citation of their own, by their id.
function dataset() {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run(`INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'),
    (3, '@I3@')`);
  db.run(
    "INSERT INTO families (id, xref, husband_id, wife_id) VALUES (1, '@F1@', 1, 2)"
  );
  db.run(`INSERT INTO facts (id, scope_type, scope_id, tag, date_text)
    VALUES (1, 'person', 1, 'BIRT', '3 MAR 1795'),
      (2, 'person', 1, 'CHR', '12 MAR 1795'),
      (3, 'family', 1, 'MARR', '1820'), (4, 'person', 3, 'BIRT', NULL)`);
  db.run(`INSERT INTO citations (id, scope_type, scope_id, text)
    VALUES (1, 'person', 1, 'Matti'), (2, 'person', 2, 'Liisa'),
      (3, 'person', 3, 'Juho')`);
  const astia = juvaAstia();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const changes: NewChange[] = [];
  const citations = createCitations(db, {
    images: openImages({ astia, parishes: memoryParishes(), sizeOf }),
    references: referencesFor(dir, db, { astia, sizeOf }),
    changed: (c) => {
      changes.push(c);
    }
  });
  return { db, citations, changes };
}

test('a Citation supports Facts of its person, with a Change for each', () => {
  const { citations, changes } = dataset();
  expect(citations.support(1, 1, true)?.supports).toEqual([1]);
  expect(citations.support(1, 2, true)?.supports).toEqual([1, 2]);
  // Again changes nothing, and writes no Change.
  expect(citations.support(1, 2, true)?.supports).toEqual([1, 2]);
  expect(citations.support(1, 1, false)?.supports).toEqual([2]);
  expect(citations.ofPerson(1).map((c) => c.supports)).toEqual([[2]]);
  expect(changes).toEqual([
    {
      on: { citationId: 1 },
      what: { kind: 'support', did: 'add', tag: 'BIRT', fact: '3.3.1795' }
    },
    {
      on: { citationId: 1 },
      what: { kind: 'support', did: 'add', tag: 'CHR', fact: '12.3.1795' }
    },
    {
      on: { citationId: 1 },
      what: { kind: 'support', did: 'remove', tag: 'BIRT', fact: '3.3.1795' }
    }
  ]);
});

test("a spouse's Citation supports their marriage, no one's another's Facts", () => {
  const { citations } = dataset();
  expect(citations.support(2, 3, true)?.supports).toEqual([3]);
  expect(citations.support(1, 3, true)?.supports).toEqual([3]);
  expect(citations.support(3, 1, true)).toBeNull();
  expect(citations.support(3, 3, true)).toBeNull();
  expect(citations.support(9, 1, true)).toBeNull();
  expect(citations.support(1, 9, true)).toBeNull();
});

test("a Citation of no Entry says what it's given, with a Change", async () => {
  const { citations, changes } = dataset();
  expect(await citations.retext(3, ' Syntyi  3.3.1795\n\n Kotona ')).toEqual({
    text: 'Syntyi 3.3.1795\nKotona'
  });
  expect(citations.ofPerson(3).map((c) => c.text)).toEqual([
    'Syntyi 3.3.1795\nKotona'
  ]);
  expect(citations.ofPerson(1).map((c) => c.text)).toEqual(['Matti']);
  expect(changes).toEqual([
    {
      on: { personId: 3 },
      what: { kind: 'retext', cited: null, text: 'Syntyi 3.3.1795\nKotona' }
    }
  ]);
  expect(await citations.retext(3, '  ')).toEqual({ text: null });
  expect(await citations.retext(99, 'x')).toBeNull();
});

test('support goes with its Fact, its Citation, and a spouse leaving the family', () => {
  const { db, citations } = dataset();
  citations.support(1, 1, true);
  citations.support(1, 3, true);
  citations.support(2, 3, true);
  citations.support(3, 4, true);
  db.run('DELETE FROM facts WHERE id = 1');
  citations.uncite(3);
  const family = createTree(db)
    .families()
    .find((f) => f.id === 1)!;
  db.transaction(() => {
    leaveFamily(db, 2, family);
  })();
  expect(
    db
      .query('SELECT fact_id, citation_id FROM fact_citations ORDER BY fact_id')
      .all()
  ).toEqual([{ fact_id: 3, citation_id: 1 }]);
});

test('a Citation made of a baptism for its child supports their Christening', async () => {
  const { citations, changes } = dataset();
  function at(image: number) {
    return {
      volumeId: 'juva-3',
      image,
      fileId: fileId('juva-3', image, 'full'),
      box: { left: 100, top: 200, width: 500, height: 50 }
    };
  }
  const made = await citations.entries.make(at(3), null, [
    { personId: 1, role: 'CHIL' }
  ]);
  expect(made).toMatchObject([{ citation: { supports: [2] } }]);
  expect(changes.map((c) => c.what.kind)).toEqual(['cite', 'support']);
  // Their father in it supports none of his Facts.
  const father = await citations.entries.make(at(4), null, [
    { personId: 3, role: 'FATH' }
  ]);
  expect(father).toMatchObject([{ citation: { supports: [] } }]);
});
