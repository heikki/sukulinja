import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { DatasetRegistry } from './dataset-registry';

let root = '';
let registry = new DatasetRegistry('/');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dataset-registry-'));
  registry = new DatasetRegistry(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createFresh', () => {
  test('creates the directory structure and applies schema', async () => {
    const { db, mediaDir } = await registry.createFresh('foo');
    expect(existsSync(join(root, 'foo', 'db.sqlite'))).toBe(true);
    expect(existsSync(mediaDir)).toBe(true);
    expect(mediaDir).toBe(join(root, 'foo', 'media'));

    const row = db
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_schema WHERE type='table' AND name='meta'")
      .get();
    expect(row?.name).toBe('meta');
  });

  test('wipes a pre-existing dirty directory', async () => {
    await registry.createFresh('foo');
    await writeFile(join(root, 'foo', 'junk.txt'), 'leftover');
    await writeFile(join(root, 'foo', 'media', 'stale.jpg'), 'old bytes');

    const { mediaDir } = await registry.createFresh('foo');
    expect(existsSync(join(root, 'foo', 'junk.txt'))).toBe(false);
    expect(await readdir(mediaDir)).toEqual([]);
  });

  test('rejects invalid slugs before any disk write', async () => {
    const bads = ['', 'Foo', 'foo/bar', '../baz', '-leading-dash'];
    const settled = await Promise.allSettled(
      bads.map((bad) => registry.createFresh(bad))
    );
    for (const r of settled) expect(r.status).toBe('rejected');
    expect(await readdir(root)).toEqual([]);
  });
});

describe('open', () => {
  test('returns the same Database instance on repeat calls', async () => {
    await registry.createFresh('foo');
    const a = registry.open('foo');
    const b = registry.open('foo');
    expect(a).toBe(b);
  });

  test('throws for an unknown slug', () => {
    expect(() => registry.open('does-not-exist')).toThrow();
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
    await registry.createFresh('keeper');
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
    await registry.createFresh('foo');
    expect(existsSync(join(root, 'foo'))).toBe(true);
    expect(await registry.delete('foo')).toBe(true);
    expect(existsSync(join(root, 'foo'))).toBe(false);
  });

  test('returns false for an unknown slug', async () => {
    expect(await registry.delete('nope')).toBe(false);
  });

  test('closes the cached handle so the slug can be recreated', async () => {
    await registry.createFresh('foo');
    registry.open('foo');
    await registry.delete('foo');
    const { db } = await registry.createFresh('foo');
    expect(
      db.query("SELECT 1 AS ok FROM sqlite_schema WHERE name='meta'").get()
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
    const { db: aDb } = await registry.createFresh('alpha');
    aDb
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('display_name', 'Alpha Tree'), ('imported_at', '2026-01-01T00:00:00Z')"
      )
      .run();
    aDb.prepare("INSERT INTO persons (xref) VALUES ('@I1@'), ('@I2@')").run();
    aDb
      .prepare(
        "INSERT INTO families (xref, husband_id, wife_id) VALUES ('@F1@', NULL, NULL)"
      )
      .run();

    await registry.createFresh('bravo');

    const list = await registry.list();
    expect(list).toEqual([
      {
        slug: 'alpha',
        displayName: 'Alpha Tree',
        personCount: 2,
        familyCount: 1,
        importedAt: '2026-01-01T00:00:00Z'
      },
      {
        slug: 'bravo',
        displayName: 'bravo',
        personCount: 0,
        familyCount: 0,
        importedAt: null
      }
    ]);
  });

  test('skips junk subdirs without a db.sqlite', async () => {
    await registry.createFresh('real');
    await mkdtemp(join(root, 'junk-')); // a dir without db.sqlite
    const list = await registry.list();
    expect(list.map((d) => d.slug)).toEqual(['real']);
  });

  test('skips subdirs with invalid slug names', async () => {
    await registry.createFresh('ok');
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
