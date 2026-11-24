import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { treeSnapshot } from '@test/tree-snapshot';

import type { NewChange } from '../changes/changes';
import { Refusal } from '../operations';
import { createTree } from '../tree';
import { copyRefused } from './copy';
import { copyOperations } from './copy-operations';
import { DatasetRegistry } from './registry';

const SIGNAL = new AbortController().signal;

const DEMO = resolve(import.meta.dir, '../../../resources/demo/bourbon.gdz');

// Made-up people in a chain: Matti (1) and Liisa (2) with Juho (3), who
// married Anna (4) and had Kalle (5). Matti and Kalle cite sources of
// their own, Matti's with a shared note, and both cite one they share.
const GEDCOM = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 BIRT',
  '2 DATE 1750',
  '2 SOUR @S1@',
  '1 SOUR @S3@',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 FAMC @F1@',
  '1 FAMS @F2@',
  '0 @I4@ INDI',
  '1 NAME Anna /Muu/',
  '1 FAMS @F2@',
  '0 @I5@ INDI',
  '1 NAME Kalle /Esimerkki/',
  '1 BIRT',
  '2 DATE 1800',
  '2 SOUR @S2@',
  '3 PAGE Sivu 12',
  '1 SOUR @S3@',
  '1 FAMC @F2@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '1 MARR',
  '2 DATE 1775',
  '0 @F2@ FAM',
  '1 HUSB @I3@',
  '1 WIFE @I4@',
  '1 CHIL @I5@',
  '0 @S1@ SOUR',
  '1 TITL Matin kastekirja',
  '1 SNOTE @N1@',
  '0 @S2@ SOUR',
  '1 TITL Kallen kastekirja',
  '0 @S3@ SOUR',
  '1 TITL Rippikirja',
  '0 @N1@ SNOTE Vain Matin lähteessä',
  '0 TRLR',
  ''
].join('\n');

let root = '';
let registry = new DatasetRegistry('/');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dataset-copy-'));
  registry = new DatasetRegistry(root);
  await registry.import({
    slug: 'suku',
    displayName: 'Suku',
    source: { gedcom: GEDCOM },
    sourceFilename: 'suku.ged'
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function names(slug: string) {
  return createTree(registry.open(slug))
    .persons()
    .map((p) => p.given ?? '')
    .sort((a, b) => a.localeCompare(b));
}

function titles(slug: string) {
  return registry
    .open(slug)
    .query<{ title: string }, []>('SELECT title FROM sources ORDER BY title')
    .all()
    .map((r) => r.title);
}

// Juho, Anna and Kalle.
async function copyYoung() {
  const tree = createTree(registry.open('suku'));
  const ids = tree
    .persons()
    .filter((p) => ['Juho', 'Anna', 'Kalle'].includes(p.given ?? ''))
    .map((p) => p.id);
  return await registry.copy({
    from: 'suku',
    personIds: ids,
    slug: 'nuoret',
    displayName: 'Nuoret'
  });
}

describe('copying people as a new dataset', () => {
  test('takes them, the families among them and what they cite', async () => {
    const info = await copyYoung();
    expect(info).toMatchObject({
      slug: 'nuoret',
      displayName: 'Nuoret',
      personCount: 3,
      familyCount: 1
    });
    expect(names('nuoret')).toEqual(['Anna', 'Juho', 'Kalle']);
    // Matti's own source stays behind; the one he shared with Kalle comes.
    expect(titles('nuoret')).toEqual(['Kallen kastekirja', 'Rippikirja']);
    // So does the shared note only his source held.
    expect(
      registry.open('suku').query('SELECT text FROM shared_notes').all()
    ).toEqual([{ text: 'Vain Matin lähteessä' }]);
    expect(
      registry.open('nuoret').query('SELECT * FROM shared_notes').all()
    ).toEqual([]);
    const page = registry
      .open('nuoret')
      .query<{ page: string }, []>(
        'SELECT page FROM citations WHERE page IS NOT NULL'
      )
      .all();
    expect(page).toEqual([{ page: 'Sivu 12' }]);
  });

  test('leaves the dataset they came from as it was', async () => {
    const before = treeSnapshot(registry.open('suku'));
    await copyYoung();
    expect(treeSnapshot(registry.open('suku'))).toEqual(before);
    // Its scratch copy is gone.
    expect((await readdir(root)).sort()).toEqual(['nuoret', 'suku']);
  });

  test('a family with one of its members left goes, with its Facts', async () => {
    const tree = createTree(registry.open('suku'));
    const ids = tree
      .persons()
      .filter((p) => p.given !== 'Liisa')
      .map((p) => p.id);
    await registry.copy({
      from: 'suku',
      personIds: ids,
      slug: 'ilman',
      displayName: 'Ilman Liisaa'
    });
    // Matti and Juho still share F1, so it stays, its marriage too.
    const marriages = registry
      .open('ilman')
      .query('SELECT * FROM facts WHERE tag = ?')
      .all('MARR');
    expect(marriages).toHaveLength(1);
    expect(createTree(registry.open('ilman')).families()).toHaveLength(2);
  });

  test('everyone copied is the same tree', async () => {
    await registry.import({
      slug: 'demo',
      source: { gedzip: await Bun.file(DEMO).bytes() },
      sourceFilename: 'bourbon.gdz'
    });
    const everyone = createTree(registry.open('demo'))
      .persons()
      .map((p) => p.id);
    await registry.copy({
      from: 'demo',
      personIds: everyone,
      slug: 'kopio',
      displayName: 'Kopio'
    });
    expect(treeSnapshot(registry.open('kopio'))).toEqual(
      treeSnapshot(registry.open('demo'))
    );
  });
});

describe('what can be copied', () => {
  test('one tree of people there are', () => {
    const tree = createTree(registry.open('suku'));
    expect(copyRefused(tree, [3, 4, 5])).toBeNull();
    expect(copyRefused(tree, [])).toBe('No one to copy.');
    expect(copyRefused(tree, [3, 99])).toBe('No such person.');
    // Matti and Kalle have only Juho between them.
    expect(copyRefused(tree, [1, 5])).toBe(
      "They aren't one tree: someone would be cut off from the rest."
    );
  });
});

// Why the app refused, in its words; null when it didn't.
async function refusal(answer: unknown) {
  try {
    await Promise.resolve(answer);
    return null;
  } catch (err) {
    return err instanceof Refusal ? err.message : String(err);
  }
}

describe('the operation', () => {
  function operations(changes: Array<[string, NewChange]>) {
    return copyOperations({
      registry,
      slug: 'suku',
      tree: createTree(registry.open('suku')),
      changed: (slug, change) => {
        changes.push([slug, change]);
      }
    });
  }

  test('copies them under the name, the Change saying from where', async () => {
    const changes: Array<[string, NewChange]> = [];
    const info = await operations(changes).copyToNewDataset(
      {
        name: '  Nuoret polvet ',
        personIds: [3, 4, 5]
      },
      SIGNAL
    );
    expect(info.slug).toBe('nuoret-polvet');
    expect(info.displayName).toBe('Nuoret polvet');
    expect(changes).toEqual([
      [
        'nuoret-polvet',
        {
          on: null,
          what: { kind: 'new-dataset', copied: { from: 'Suku', people: 3 } }
        }
      ]
    ]);
  });

  test('refuses a name taken, or people apart, copying nothing', async () => {
    const changes: Array<[string, NewChange]> = [];
    const ops = operations(changes);
    expect(
      await refusal(
        ops.copyToNewDataset({ name: 'Suku', personIds: [3] }, SIGNAL)
      )
    ).toBe("There's a dataset named Suku already.");
    expect(
      await refusal(
        ops.copyToNewDataset({ name: 'Osa', personIds: [1, 5] }, SIGNAL)
      )
    ).toBe("They aren't one tree: someone would be cut off from the rest.");
    expect(
      await refusal(
        ops.copyToNewDataset({ name: '!!', personIds: [3] }, SIGNAL)
      )
    ).toBe('The name needs a letter or a digit.');
    expect((await registry.list()).map((d) => d.slug)).toEqual(['suku']);
    expect(changes).toEqual([]);
  });
});
