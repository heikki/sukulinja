import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { NoImageError, openAstia, volumeYears } from './astia';

const ARCHIVE = '100';

function unit(id: string, level: string, label: string) {
  return {
    name: 'UNIT',
    children: [
      { name: 'ID', tagData: id },
      { name: 'TASO', tagData: level },
      { name: 'LABEL', tagData: label },
      { name: 'DIGI', tagData: 'true' }
    ]
  };
}

function file(id: string) {
  return { name: 'FILE', children: [{ name: 'URL', tagData: id }] };
}

// Astia's answers by request, after its base URL: an archive whose
// population register holds one Volume, a series of movers it can skip,
// and a series with another Volume.
const ANSWERS: Readonly<Record<string, unknown>> = {
  [`ws/aineisto/readOne.php?id=${ARCHIVE}`]: {
    titles: 'Juvan seurakunnan arkisto',
    sisaltyvat: [
      unit('110', 'series', 'II KIRKONARKISTO'),
      unit('120', 'series', 'I VÄESTÖREKISTERIARKISTO')
    ]
  },
  'ws/aineisto/readOne.php?id=120': {
    sisaltyvat: [
      unit('121', 'file', 'I Aa:1 Pää- ja rippikirjat (1790-1796)'),
      unit('122', 'series', 'Muuttaneiden luettelot'),
      unit('123', 'series', 'Lastenkirjat')
    ]
  },
  'ws/aineisto/readOne.php?id=123': {
    sisaltyvat: [
      unit(
        '124',
        'file',
        'I Ab:1 Lastenkirjat, 1801-1803, 1806-1810 (1801-1810)'
      )
    ]
  },
  'ws/aineisto/digitoidut.php?id=121': {
    isot: [file('121-f1'), file('121-f2')],
    pienet: [file('121-t1'), file('121-t2')]
  }
};

// As Astia answers now: ANSWERS, unless a test re-scans a Volume.
let answers: Record<string, unknown> = {};
let dir = '';
// The requests that went out, after Astia's base URL.
let sent: string[] = [];
// Statuses, or 200 bodies, to answer with, in order, before the real answer.
let failures: Array<number | Uint8Array<ArrayBuffer>> = [];

function fakeFetch(url: string) {
  const path = url.replace(/^https:\/\/astia\.narc\.fi\/uusiastia\//, '');
  sent.push(path);
  const status = failures.shift();
  if (status instanceof Uint8Array) {
    return Promise.resolve(new Response(status));
  }
  if (status !== undefined) {
    return Promise.resolve(new Response('', { status }));
  }
  if (path.startsWith('ws/getFile.php')) {
    return Promise.resolve(new Response(new Uint8Array([0xff, 0xd8])));
  }
  const answer = answers[path];
  return Promise.resolve(
    answer === undefined
      ? new Response('', { status: 404 })
      : Response.json(answer)
  );
}

// What the request failed with; it must fail.
async function failure(request: Promise<unknown>) {
  return await request
    .then(() => 'succeeded')
    .catch((err: unknown) => String(err));
}

function open(cacheDir = join(dir, 'cache')) {
  return openAstia(cacheDir, { fetch: fakeFetch, gapMs: 0 });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'astia-'));
  answers = { ...ANSWERS };
  sent = [];
  failures = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('reads a volume label into its span and parts', () => {
  expect(volumeYears('I Aa:5 Pää- ja rippikirjat (1790-1796)')).toEqual({
    years: { from: 1790, to: 1796 },
    parts: [{ from: 1790, to: 1796 }]
  });
  expect(
    volumeYears(
      'I Aa:3 Pää- ja rippikirjat, 1766-1771, 1788-1789 kylät Hankamäki-Orala (1766-1789)'
    )
  ).toEqual({
    years: { from: 1766, to: 1789 },
    parts: [
      { from: 1766, to: 1771 },
      { from: 1788, to: 1789 }
    ]
  });
  expect(volumeYears('Kirkkokurin alaisten luettelot, 1788')).toEqual({
    years: { from: 1788, to: 1788 },
    parts: [{ from: 1788, to: 1788 }]
  });
});

test("crawls the population register's Volumes, skipping series that can't hold them", async () => {
  expect(await open().archiveVolumes(ARCHIVE)).toEqual([
    {
      id: '121',
      level: 'file',
      label: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
      digitized: true,
      kind: 'rippi',
      years: { from: 1790, to: 1796 },
      parts: [{ from: 1790, to: 1796 }]
    },
    {
      id: '124',
      level: 'file',
      label: 'I Ab:1 Lastenkirjat, 1801-1803, 1806-1810 (1801-1810)',
      digitized: true,
      kind: 'lasten',
      years: { from: 1801, to: 1810 },
      parts: [
        { from: 1801, to: 1803 },
        { from: 1806, to: 1810 }
      ]
    }
  ]);
  expect(sent.toSorted()).toEqual([
    `ws/aineisto/readOne.php?id=${ARCHIVE}`,
    'ws/aineisto/readOne.php?id=120',
    'ws/aineisto/readOne.php?id=123'
  ]);
});

test("gives a Volume's Images, the archive's title and an Image's bytes", async () => {
  const astia = open();
  expect(await astia.volumeImages('121')).toEqual(['121-f1', '121-f2']);
  expect(await astia.volumeImages('121', 'thumb')).toEqual([
    '121-t1',
    '121-t2'
  ]);
  expect(await astia.archiveTitle(ARCHIVE)).toBe('Juvan seurakunnan arkisto');
  expect(await astia.archiveTitle('999')).toBeNull();
  expect(await astia.imageBytes('121', '121-f2')).toEqual(
    new Uint8Array([0xff, 0xd8])
  );
});

test('keeps answers in its folder, for the next Astia opened on it', async () => {
  const first = await open().archiveVolumes(ARCHIVE);
  await open().volumeImages('121');
  sent = [];
  const again = open();
  expect(await again.archiveVolumes(ARCHIVE)).toEqual(first);
  expect(await again.volumeImages('121')).toEqual(['121-f1', '121-f2']);
  expect(sent).toEqual([]);
});

test('Astias on different folders share nothing', async () => {
  await open(join(dir, 'a')).archiveVolumes(ARCHIVE);
  sent = [];
  await open(join(dir, 'b')).archiveVolumes(ARCHIVE);
  expect(sent).toHaveLength(3);
});

test("doesn't keep a failure: the next call asks again", async () => {
  const astia = open();
  failures = [404];
  expect(await failure(astia.archiveVolumes(ARCHIVE))).toBe(
    `AstiaError: 404 ws/aineisto/readOne.php?id=${ARCHIVE}`
  );
  expect((await astia.archiveVolumes(ARCHIVE)).map((v) => v.id)).toEqual([
    '121',
    '124'
  ]);
});

test('retries a failing Image briefly, then gives up', async () => {
  const started = performance.now();
  failures = [503, 503, 503];
  expect(await failure(open().imageBytes('121', '121-f1'))).toMatch(
    /^AstiaError: 503 /
  );
  expect(sent).toHaveLength(3);
  expect(performance.now() - started).toBeLessThan(3000);
});

// The start of the PNG Astia gives in place of an Image now and then.
const PLACEHOLDER = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

test("retries Astia's placeholder in place of an Image", async () => {
  failures = [PLACEHOLDER];
  expect(await open().imageBytes('121', '121-t1')).toEqual(
    new Uint8Array([0xff, 0xd8])
  );
  expect(sent).toHaveLength(2);
});

test("gives up on an Image that stays Astia's placeholder: it has no such file", async () => {
  failures = [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER];
  const gone = await open()
    .imageBytes('121', '121-t1')
    .catch((err: unknown) => err);
  expect(gone).toBeInstanceOf(NoImageError);
  expect(String(gone)).toMatch(/^NoImageError: no image /);
  expect(sent).toHaveLength(3);
});

const IMAGES_121 = 'ws/aineisto/digitoidut.php?id=121';

// Astia holds Volume 121 filmed anew, with three Images.
function rescan121() {
  answers[IMAGES_121] = {
    isot: [file('121-2-f1'), file('121-2-f2'), file('121-2-f3')],
    pienet: [file('121-2-t1'), file('121-2-t2'), file('121-2-t3')]
  };
}

test("asks for a re-scanned Volume's list again, and keeps the new one", async () => {
  await open().volumeImages('121');
  rescan121();
  const astia = open();
  expect(await astia.volumeImages('121')).toEqual(['121-f1', '121-f2']);
  sent = [];
  await astia.refreshImages('121');
  expect(sent).toEqual([IMAGES_121]);
  const renewed = ['121-2-f1', '121-2-f2', '121-2-f3'];
  expect(await astia.volumeImages('121')).toEqual(renewed);
  expect(await open().volumeImages('121')).toEqual(renewed);
  expect(sent).toEqual([IMAGES_121]);
});

test('refreshes asked for at once share one request', async () => {
  const astia = open();
  await astia.volumeImages('121');
  rescan121();
  sent = [];
  await Promise.all([astia.refreshImages('121'), astia.refreshImages('121')]);
  expect(sent).toEqual([IMAGES_121]);
  expect(await astia.volumeImages('121', 'thumb')).toHaveLength(3);
});

test('a failed refresh keeps the list it had', async () => {
  const astia = open();
  await astia.volumeImages('121');
  failures = [404];
  expect(await failure(astia.refreshImages('121'))).toBe(
    `AstiaError: 404 ${IMAGES_121}`
  );
  expect(await astia.volumeImages('121')).toEqual(['121-f1', '121-f2']);
  expect(await open().volumeImages('121')).toEqual(['121-f1', '121-f2']);
});

test("doesn't wait out a rate limit on an Image", async () => {
  failures = [429];
  expect(await failure(open().imageBytes('121', '121-f1'))).toMatch(
    /^AstiaError: 429 /
  );
  expect(sent).toHaveLength(1);
});

test("a request that can't reach Astia throws an AstiaError", async () => {
  const astia = openAstia(join(dir, 'cache'), {
    fetch: () => Promise.reject(new TypeError('network down')),
    gapMs: 0
  });
  expect(await failure(astia.archiveVolumes(ARCHIVE))).toBe(
    `AstiaError: TypeError: network down on ws/aineisto/readOne.php?id=${ARCHIVE}`
  );
  expect(await failure(astia.imageBytes('121', '121-f1'))).toMatch(
    /^AstiaError: TypeError: network down on ws\/getFile/
  );
  expect(await astia.archiveTitle(ARCHIVE)).toBeNull();
});
