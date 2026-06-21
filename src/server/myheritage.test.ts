import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { findChild } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import {
  collectFileUrls,
  convertMyHeritage,
  dropTags,
  isMyHeritageExport,
  pruneEmptyLeaves,
  stripCutouts,
  transformObjes
} from './myheritage';

function node(
  level: number,
  tag: string,
  value?: string,
  children: GedNode[] = []
): GedNode {
  const n: GedNode = { level, tag, children };
  if (value !== undefined) n.value = value;
  return n;
}

// An OBJE block in MyHeritage 5.5.1 shape: FORM and _POSITION are siblings of
// FILE, not children of it.
function obje(file: string, ...extra: GedNode[]): GedNode {
  return node(1, 'OBJE', undefined, [
    node(2, 'FORM', 'jpg'),
    node(2, 'FILE', file),
    ...extra
  ]);
}

function indi(...children: GedNode[]): GedNode {
  return node(0, 'INDI', undefined, children);
}

describe('stripCutouts', () => {
  test('removes OBJE blocks flagged _CUTOUT Y, keeps the rest', () => {
    const root = indi(
      obje('cut.jpg', node(2, '_CUTOUT', 'Y')),
      obje('keep.jpg')
    );
    expect(stripCutouts([root])).toBe(1);
    const files = root.children.map((o) => findChild(o, 'FILE')?.value);
    expect(files).toEqual(['keep.jpg']);
  });
});

describe('dropTags', () => {
  test('drops level-keyed tags only at the matching depth', () => {
    const root = indi(
      node(1, '_UID', 'x'),
      obje('a.jpg', node(2, '_FILESIZE', '123'), node(2, '_PRIM', 'Y'))
    );
    const dropped = dropTags([root], new Set(['1\t_UID', '2\t_FILESIZE']));
    expect(dropped).toBe(2);
    expect(findChild(root, '_UID')).toBeUndefined();
    const obj = findChild(root, 'OBJE')!;
    expect(findChild(obj, '_FILESIZE')).toBeUndefined();
    expect(findChild(obj, '_PRIM')?.value).toBe('Y');
  });
});

describe('pruneEmptyLeaves', () => {
  test('drops valueless childless nodes bottom-up', () => {
    const root = indi(
      node(1, 'MARR'),
      node(1, 'BIRT', undefined, [node(2, 'DATE', '1900')])
    );
    expect(pruneEmptyLeaves([root])).toBe(1);
    expect(findChild(root, 'MARR')).toBeUndefined();
    expect(findChild(root, 'BIRT')).toBeDefined();
  });
});

describe('transformObjes', () => {
  test('moves FORM under FILE as a MIME type', () => {
    const root = indi(obje('a.jpg'));
    transformObjes([root]);
    const obj = findChild(root, 'OBJE')!;
    expect(findChild(obj, 'FORM')).toBeUndefined();
    const file = findChild(obj, 'FILE')!;
    expect(findChild(file, 'FORM')?.value).toBe('image/jpeg');
  });

  test('converts _POSITION x1 y1 x2 y2 to a CROP block under FILE', () => {
    const root = indi(obje('a.jpg', node(2, '_POSITION', '217 225 1318 1693')));
    transformObjes([root]);
    const file = findChild(findChild(root, 'OBJE')!, 'FILE')!;
    const crop = findChild(file, 'CROP')!;
    expect(crop).toBeDefined();
    expect(findChild(crop, 'TOP')?.value).toBe('225');
    expect(findChild(crop, 'LEFT')?.value).toBe('217');
    expect(findChild(crop, 'WIDTH')?.value).toBe(String(1318 - 217));
    expect(findChild(crop, 'HEIGHT')?.value).toBe(String(1693 - 225));
  });

  test('leaves a malformed _POSITION untouched', () => {
    const root = indi(obje('a.jpg', node(2, '_POSITION', '1 2 3')));
    transformObjes([root]);
    const obj = findChild(root, 'OBJE')!;
    expect(findChild(obj, '_POSITION')).toBeDefined();
    expect(findChild(findChild(obj, 'FILE')!, 'CROP')).toBeUndefined();
  });
});

describe('collectFileUrls', () => {
  test('returns unique http(s) FILE values, ignoring local paths', () => {
    const root = indi(
      obje('https://x/a.jpg'),
      obje('https://x/a.jpg'),
      obje('local/b.jpg')
    );
    expect(collectFileUrls([root])).toEqual(['https://x/a.jpg']);
  });
});

describe('isMyHeritageExport', () => {
  test('detects the HEAD.SOUR marker', () => {
    const head = node(0, 'HEAD', undefined, [node(1, 'SOUR', 'MYHERITAGE')]);
    expect(isMyHeritageExport([head, indi()])).toBe(true);
  });

  test('detects mhcache.com image URLs', () => {
    const head = node(0, 'HEAD', undefined, []);
    const root = indi(obje('https://sites-cf.mhcache.com/e/1/x.jpg'));
    expect(isMyHeritageExport([head, root])).toBe(true);
  });

  test('is false for an ordinary export', () => {
    const head = node(0, 'HEAD', undefined, [node(1, 'SOUR', 'Gramps')]);
    expect(isMyHeritageExport([head, indi(obje('local/a.jpg'))])).toBe(false);
  });
});

describe('convertMyHeritage', () => {
  let staging = '';

  beforeEach(async () => {
    staging = await mkdtemp(join(tmpdir(), 'myheritage-test-'));
  });
  afterEach(async () => {
    await rm(staging, { recursive: true, force: true });
  });

  test('rewrites succeeded URLs to flat names and leaves failures remote', async () => {
    const root = indi(
      obje('https://x/ok.jpg', node(2, '_CUTOUT', 'Y')),
      obje('https://x/photo.jpg', node(2, '_POSITION', '0 0 10 20')),
      obje('https://x/dead.jpg')
    );
    const tried: string[] = [];
    const result = await convertMyHeritage([root], {
      stagingDir: staging,
      download: (url) => {
        tried.push(url);
        return Promise.resolve(url.includes('dead') ? 'fail(403)' : 'ok');
      }
    });

    // The cutout OBJE is stripped, so its URL is never downloaded.
    expect(tried.sort()).toEqual(['https://x/dead.jpg', 'https://x/photo.jpg']);
    expect(result.stripped).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toEqual(['https://x/dead.jpg']);

    const files = root.children.map((o) => findChild(o, 'FILE')!.value);
    expect(files).toContain('photo.jpg');
    expect(files).toContain('https://x/dead.jpg'); // failure kept remote
  });

  test('disambiguates colliding basenames across distinct URLs', async () => {
    const root = indi(obje('https://a/p.jpg'), obje('https://b/p.jpg'));
    await convertMyHeritage([root], {
      stagingDir: staging,
      download: () => Promise.resolve('ok')
    });
    const files = root.children.map((o) => findChild(o, 'FILE')!.value);
    expect(new Set(files).size).toBe(2);
    expect(files).toContain('p.jpg');
    expect(files).toContain('p-1.jpg');
  });
});
