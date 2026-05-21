import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { GedNode } from './gedcom-parser';
import { ingest } from './media-ingest';

function objeWithFile(relpath: string): GedNode {
  return {
    level: 1,
    tag: 'OBJE',
    children: [{ level: 2, tag: 'FILE', value: relpath, children: [] }]
  };
}

function indi(...obje: GedNode[]): GedNode {
  return { level: 0, xref: '@I1@', tag: 'INDI', children: obje };
}

let tmp = '';
let sourceDir = '';
let targetDir = '';

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'media-ingest-'));
  sourceDir = join(tmp, 'source');
  targetDir = join(tmp, 'target');
  await Bun.write(join(sourceDir, '.keep'), '');
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('ingest', () => {
  test('writes hashed files and returns a resolution map', async () => {
    await Bun.write(join(sourceDir, 'a.jpg'), 'AAAA');
    await Bun.write(join(sourceDir, 'b.png'), 'BBBB');

    const result = await ingest({
      roots: [indi(objeWithFile('a.jpg'), objeWithFile('b.png'))],
      sourceDir,
      targetDir
    });

    expect(result.skipped).toEqual([]);
    expect(result.resolved.size).toBe(2);
    const aName = result.resolved.get('a.jpg')!;
    const bName = result.resolved.get('b.png')!;
    expect(aName).toMatch(/^[0-9a-f]{12}\.jpg$/u);
    expect(bName).toMatch(/^[0-9a-f]{12}\.png$/u);
    expect(aName).not.toBe(bName);

    const written = (await readdir(targetDir)).sort();
    expect(written).toEqual([aName, bName].sort());
  });

  test('identical bytes from different relpaths produce one file', async () => {
    await Bun.write(join(sourceDir, 'photos/x.jpg'), 'SAME');
    await Bun.write(join(sourceDir, 'actes/y.jpg'), 'SAME');

    const result = await ingest({
      roots: [indi(objeWithFile('photos/x.jpg'), objeWithFile('actes/y.jpg'))],
      sourceDir,
      targetDir
    });

    expect(result.skipped).toEqual([]);
    const a = result.resolved.get('photos/x.jpg');
    const b = result.resolved.get('actes/y.jpg');
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(await readdir(targetDir)).toEqual([a!]);
  });

  test('missing source is skipped with reason: missing', async () => {
    const result = await ingest({
      roots: [indi(objeWithFile('nope.jpg'))],
      sourceDir,
      targetDir
    });

    expect(result.resolved.size).toBe(0);
    expect(result.skipped).toEqual([
      { originalRelpath: 'nope.jpg', reason: 'missing' }
    ]);
  });

  test('absolute paths are skipped with reason: absolute', async () => {
    const result = await ingest({
      roots: [
        indi(
          objeWithFile('C:\\Users\\foo\\bar.jpg'),
          objeWithFile('/etc/passwd')
        )
      ],
      sourceDir,
      targetDir
    });

    expect(result.resolved.size).toBe(0);
    expect(result.skipped).toEqual([
      { originalRelpath: 'C:\\Users\\foo\\bar.jpg', reason: 'absolute' },
      { originalRelpath: '/etc/passwd', reason: 'absolute' }
    ]);
  });

  test('OBJE nested inside an event (not a direct child of INDI/FAM) is ignored', async () => {
    await Bun.write(join(sourceDir, 'nested.jpg'), 'NEST');
    const eventWithObje: GedNode = {
      level: 1,
      tag: 'BIRT',
      children: [objeWithFile('nested.jpg')]
    };
    const result = await ingest({
      roots: [indi(eventWithObje)],
      sourceDir,
      targetDir
    });
    expect(result.resolved.size).toBe(0);
    expect(result.skipped).toEqual([]);
  });

  test('top-level OBJE record (referenced by pointer) is ignored', async () => {
    await Bun.write(join(sourceDir, 'top.jpg'), 'TOP');
    const topObjeRecord: GedNode = {
      level: 0,
      xref: '@M1@',
      tag: 'OBJE',
      children: [{ level: 1, tag: 'FILE', value: 'top.jpg', children: [] }]
    };
    const result = await ingest({
      roots: [topObjeRecord, indi()],
      sourceDir,
      targetDir
    });
    expect(result.resolved.size).toBe(0);
  });

  test('empty roots produce empty result without creating the target dir', async () => {
    const result = await ingest({ roots: [], sourceDir, targetDir });
    expect(result.resolved.size).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(existsSync(targetDir)).toBe(false);
  });
});
