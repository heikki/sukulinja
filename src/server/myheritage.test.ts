import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findChild } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import {
  collectFileUrls,
  convertMyHeritage,
  dropTags,
  dropUnassociatedPhotos,
  isMyHeritageExport,
  photoNameOf,
  pruneEmptyLeaves,
  standardUids,
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

describe('dropUnassociatedPhotos', () => {
  test('removes the @I88888888@ photo-bucket person, keeps real people', () => {
    const bucket = { ...indi(obje('a.jpg')), xref: '@I88888888@' };
    const person = { ...indi(obje('b.jpg')), xref: '@I500001@' };
    const roots = [person, bucket];
    expect(dropUnassociatedPhotos(roots)).toBe(true);
    expect(roots).toEqual([person]);
    expect(dropUnassociatedPhotos(roots)).toBe(false);
  });
});

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

describe('standardUids', () => {
  test("turns a record's _UID into UID, as written", () => {
    const root = indi(node(1, '_UID', '57946566E10CCFB0735B471A8829D14E'));
    standardUids([root]);
    expect(findChild(root, 'UID')?.value).toBe(
      '57946566E10CCFB0735B471A8829D14E'
    );
    expect(findChild(root, '_UID')).toBeUndefined();
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

describe('photoNameOf', () => {
  function photo(token: string) {
    return `https://sites-cf.mhcache.com/e/1/${token}/012/345/6789/abc_def.jpg`;
  }

  test('keeps an mhcache photo at the part after its token', () => {
    expect(photoNameOf(photo('tok1'))).toBe('012/345/6789/abc_def.jpg');
    // The next export's token differs; the photo's name doesn't.
    expect(photoNameOf(photo('tok2'))).toBe(photoNameOf(photo('tok1')));
  });

  test('hashes any other URL, keeping its extension', () => {
    const name = photoNameOf('https://x/photo.JPG');
    expect(name).toMatch(/^[0-9a-f]{16}\.jpg$/u);
    expect(photoNameOf('https://y/photo.JPG')).not.toBe(name);
    // A tail that isn't plain path segments is hashed too.
    expect(
      photoNameOf('https://sites-cf.mhcache.com/e/1/t/a%20b/c.jpg')
    ).toMatch(/^[0-9a-f]{16}\.jpg$/u);
  });
});

describe('convertMyHeritage', () => {
  let stagingDir = '';

  beforeEach(async () => {
    stagingDir = await mkdtemp(join(tmpdir(), 'myheritage-test-'));
  });
  afterEach(async () => {
    await rm(stagingDir, { recursive: true, force: true });
  });

  // Fetches a photo by writing its URL as its bytes, and keeps the URLs
  // asked for; a URL with "dead" in it fails.
  function fakeDownload() {
    const tried: string[] = [];
    async function download(url: string, dest: string) {
      tried.push(url);
      if (url.includes('dead')) return 'fail(403)';
      await Bun.write(dest, url);
      return 'ok';
    }
    return { tried, download };
  }

  test('rewrites fetched URLs to their cache names and leaves failures remote', async () => {
    const root = indi(
      obje('https://x/ok.jpg', node(2, '_CUTOUT', 'Y')),
      obje('https://x/photo.jpg', node(2, '_POSITION', '0 0 10 20')),
      obje('https://x/dead.jpg')
    );
    const { tried, download } = fakeDownload();
    const result = await convertMyHeritage([root], { stagingDir, download });

    // The cutout OBJE is stripped, so its URL is never downloaded.
    expect(tried.sort()).toEqual(['https://x/dead.jpg', 'https://x/photo.jpg']);
    expect(result.stripped).toBe(1);
    expect(result).toMatchObject({ downloaded: 1, reused: 0 });
    expect(result.failed).toEqual(['https://x/dead.jpg']);

    const files = root.children.map((o) => findChild(o, 'FILE')!.value);
    expect(files).toContain(photoNameOf('https://x/photo.jpg'));
    expect(files).toContain('https://x/dead.jpg'); // failure kept remote
    // A failed download leaves nothing under its name.
    const dead = Bun.file(join(stagingDir, photoNameOf('https://x/dead.jpg')));
    expect(await dead.exists()).toBe(false);
  });

  test('fetches a photo once, and copies one stored before instead', async () => {
    function url(token: string) {
      return `https://sites-cf.mhcache.com/e/1/${token}/1/2/3/p.jpg`;
    }
    const first = fakeDownload();
    // Two URLs naming the same photo share one fetch.
    await convertMyHeritage([indi(obje(url('a')), obje(url('b')))], {
      stagingDir,
      download: first.download
    });
    expect(first.tried).toHaveLength(1);

    const later = await mkdtemp(join(tmpdir(), 'myheritage-test-'));
    try {
      const again = fakeDownload();
      const root = indi(obje(url('c')));
      const result = await convertMyHeritage([root], {
        stagingDir: later,
        stored: (name) => join(stagingDir, name),
        download: again.download
      });
      expect(again.tried).toEqual([]);
      expect(result).toMatchObject({ downloaded: 0, reused: 1 });
      expect(findChild(root.children[0]!, 'FILE')!.value).toBe('1/2/3/p.jpg');
      expect(await Bun.file(join(later, '1/2/3/p.jpg')).text()).toBe(url('a'));
    } finally {
      await rm(later, { recursive: true, force: true });
    }
  });
});
