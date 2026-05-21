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
