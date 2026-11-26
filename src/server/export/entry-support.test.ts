// An Entry's support through a GEDZIP (ADR-0037): the copies of its
// Citations under Facts are read back as support of its owner's Facts
// only, as the import leaves an Entry's Citation supporting no one else's.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importGedcomFixture } from '@test/gedcom-fixture';

import { gatherEntries, openSupport } from '../citations';
import { openAppCitations } from '../citations/testing';
import { DatasetRegistry } from '../datasets/registry';
import { packDataset } from './dataset';

let tmp = '';
let registry = new DatasetRegistry('');
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'entry-support-'));
  registry = new DatasetRegistry(join(tmp, 'data'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("reads an Entry's copies back as support of its owner's Facts only", async () => {
  await importGedcomFixture(registry, 'a');
  const db = registry.open('a');
  // A baptism of Person 1, naming Person 2, her husband, as the father.
  function cite(personId: number) {
    return openAppCitations(db).create({
      personId,
      volumeId: '1234',
      volume: 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1796)',
      archive: 'Juvan seurakunnan arkisto',
      image: 25,
      fileId: '5678',
      box: { left: 10, top: 20, width: 300, height: 40 },
      text: null
    });
  }
  const child = cite(1);
  const father = cite(2);
  gatherEntries(db);
  db.run("UPDATE entries SET event = 'CHR'");
  db.run("UPDATE citations SET role = 'CHIL' WHERE id = ?", [child]);
  db.run("UPDATE citations SET role = 'FATH' WHERE id = ?", [father]);
  // Support made before the rule: her Birth by hers, and the couple's
  // Marriage by his.
  const support = openSupport(db);
  support.add(child, 1);
  support.add(father, 5);

  const gdz = await packDataset(db, registry.mediaDir('a'));
  await registry.import({
    slug: 'b',
    source: { gedzip: gdz },
    sourceFilename: 'a.gdz'
  });
  expect(
    registry
      .open('b')
      .query(
        `SELECT c.role, f.tag FROM fact_citations fc
         JOIN citations c ON c.id = fc.citation_id
         JOIN facts f ON f.id = fc.fact_id WHERE c.entry_id IS NOT NULL`
      )
      .all()
  ).toEqual([{ role: 'CHIL', tag: 'BIRT' }]);
});
