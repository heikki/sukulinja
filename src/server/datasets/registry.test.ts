import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { OutdatedDatasetError } from './db';
import { DatasetNotFound, DatasetRegistry } from './registry';

let root = '';
let registry = new DatasetRegistry('/');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dataset-registry-'));
  registry = new DatasetRegistry(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A dataset under `slug`, with whatever `fill` writes into it.
async function make(
  slug: string,
  fill: (db: Database) => void = () => undefined
) {
  const staged = await registry.createStaging(slug);
  fill(staged.db);
  await staged.commit();
}

describe('open', () => {
  test('returns the same Database instance on repeat calls', async () => {
    await make('foo');
    const a = registry.open('foo');
    const b = registry.open('foo');
    expect(a).toBe(b);
  });

  test('throws DatasetNotFound for an unknown slug', () => {
    expect(() => registry.open('does-not-exist')).toThrow(DatasetNotFound);
  });

  test('rejects invalid slugs', () => {
    expect(() => registry.open('Foo')).toThrow();
    expect(() => registry.open('../baz')).toThrow();
  });
});

describe('createStaging', () => {
  test('stays out of list() until committed, then publishes', async () => {
    const staged = await registry.createStaging('foo');
    staged.db.prepare("INSERT INTO persons (xref) VALUES ('@I1@')").run();
    expect(await registry.list()).toEqual([]);
    expect(existsSync(join(root, 'foo'))).toBe(false);

    await staged.commit();
    const list = await registry.list();
    expect(list.map((d) => d.slug)).toEqual(['foo']);
    expect(list[0]!.personCount).toBe(1);
  });

  test('discard removes the staged work and publishes nothing', async () => {
    const staged = await registry.createStaging('foo');
    await staged.discard();
    expect(await registry.list()).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  test('commit replaces an existing dataset and refreshes the handle', async () => {
    const first = await registry.createStaging('foo');
    first.db.prepare("INSERT INTO persons (xref) VALUES ('@I1@')").run();
    await first.commit();
    registry.open('foo'); // warm the cache with the old handle

    const second = await registry.createStaging('foo');
    second.db
      .prepare("INSERT INTO persons (xref) VALUES ('@I1@'), ('@I2@')")
      .run();
    await second.commit();

    const count = registry
      .open('foo')
      .query<{ n: number }, []>('SELECT COUNT(*) AS n FROM persons')
      .get();
    expect(count?.n).toBe(2);
  });

  test('rejects invalid slugs before any disk write', async () => {
    const [settled] = await Promise.allSettled([registry.createStaging('Foo')]);
    expect(settled.status).toBe('rejected');
    expect(await readdir(root)).toEqual([]);
  });
});

describe('sweepStaging', () => {
  test('removes leftover .staging- dirs but keeps real datasets', async () => {
    await make('keeper');
    await mkdtemp(join(root, '.staging-')); // an interrupted import's leftover
    await mkdtemp(join(root, '.staging-'));

    await registry.sweepStaging();

    expect(await readdir(root)).toEqual(['keeper']);
  });

  test('is a no-op when the data root does not exist yet', async () => {
    const fresh = new DatasetRegistry(join(root, 'does-not-exist'));
    await fresh.sweepStaging();
    expect(existsSync(join(root, 'does-not-exist'))).toBe(false);
  });
});

describe('delete', () => {
  test('removes the dataset directory and returns true', async () => {
    await make('foo');
    expect(existsSync(join(root, 'foo'))).toBe(true);
    expect(await registry.delete('foo')).toBe(true);
    expect(existsSync(join(root, 'foo'))).toBe(false);
  });

  test('returns false for an unknown slug', async () => {
    expect(await registry.delete('nope')).toBe(false);
  });

  test('closes the cached handle so the slug can be recreated', async () => {
    await make('foo');
    registry.open('foo');
    await registry.delete('foo');
    await make('foo');
    expect(
      registry
        .open('foo')
        .query("SELECT 1 AS ok FROM sqlite_schema WHERE name='meta'")
        .get()
    ).not.toBeNull();
  });

  test('rejects invalid slugs', async () => {
    const [settled] = await Promise.allSettled([registry.delete('Foo')]);
    expect(settled.status).toBe('rejected');
  });
});

describe('list', () => {
  test('empty data root returns []', async () => {
    expect(await registry.list()).toEqual([]);
  });

  test('lists installed datasets sorted by slug, with meta and counts', async () => {
    await make('alpha', (db) => {
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('display_name', 'Alpha Tree'), ('imported_at', '2026-01-01T00:00:00Z'), ('source_filename', 'alpha.ged')"
      ).run();
      db.prepare("INSERT INTO persons (xref) VALUES ('@I1@'), ('@I2@')").run();
      db.prepare(
        "INSERT INTO families (xref, husband_id, wife_id) VALUES ('@F1@', NULL, NULL)"
      ).run();
    });

    await make('bravo');

    const list = await registry.list();
    expect(list).toEqual([
      {
        slug: 'alpha',
        displayName: 'Alpha Tree',
        personCount: 2,
        familyCount: 1,
        importedAt: '2026-01-01T00:00:00Z',
        sourceFilename: 'alpha.ged',
        outdated: false,
        undoable: false
      },
      {
        slug: 'bravo',
        displayName: 'bravo',
        personCount: 0,
        familyCount: 0,
        importedAt: null,
        sourceFilename: null,
        outdated: false,
        undoable: false
      }
    ]);
  });

  test('skips junk subdirs without a db.sqlite', async () => {
    await make('real');
    await mkdtemp(join(root, 'junk-')); // a dir without db.sqlite
    const list = await registry.list();
    expect(list.map((d) => d.slug)).toEqual(['real']);
  });

  test('skips subdirs with invalid slug names', async () => {
    await make('ok');
    await mkdtemp(join(root, 'Bad-'));
    const list = await registry.list();
    expect(list.map((d) => d.slug)).toEqual(['ok']);
  });
});

describe('mediaDir', () => {
  test('returns an absolute path inside the registry root', () => {
    const p = registry.mediaDir('foo');
    expect(isAbsolute(p)).toBe(true);
    expect(p.startsWith(root)).toBe(true);
    expect(p.endsWith(join('foo', 'media'))).toBe(true);
  });

  test('rejects invalid slugs', () => {
    expect(() => registry.mediaDir('Foo')).toThrow();
  });
});

describe('a dataset an older version built', () => {
  async function writeOldDataset(slug: string) {
    await mkdir(join(root, slug), { recursive: true });
    const db = new Database(join(root, slug, 'db.sqlite'), { create: true });
    db.run('CREATE TABLE persons (id INTEGER PRIMARY KEY, xref TEXT)');
    db.run('CREATE TABLE families (id INTEGER PRIMARY KEY, xref TEXT)');
    db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.run("INSERT INTO meta VALUES ('display_name', 'Old Tree')");
    db.run("INSERT INTO persons (xref) VALUES ('@I1@')");
    db.close();
  }

  test("won't open", async () => {
    await writeOldDataset('old');
    expect(() => registry.open('old')).toThrow(OutdatedDatasetError);
  });

  test('is listed as outdated', async () => {
    await writeOldDataset('old');
    expect(await registry.list()).toEqual([
      {
        slug: 'old',
        displayName: 'Old Tree',
        personCount: 1,
        familyCount: 0,
        importedAt: null,
        sourceFilename: null,
        outdated: true,
        undoable: false
      }
    ]);
  });
});
