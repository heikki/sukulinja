import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { resolveChurchBookRef } from '@server/citation-scans/locate';
import type { Pins } from '@server/citation-scans/locate';
import { openMarks } from '@server/citation-scans/marks';
import { churchBookRefOf } from '@server/citation-scans/record';
import {
  baptismCitation,
  juvaAstia,
  rippiCitation,
  VOLUMES
} from '@server/citation-scans/test-parish';
import { pinsOf } from '@server/citation-scans/test-pins';
import { DatasetRegistry } from '@server/dataset-registry';
import { importDataset } from '@server/import-dataset';

import { movePins } from './move';

let root = '';
let registry = new DatasetRegistry('');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'move-pins-'));
  registry = new DatasetRegistry(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Matti's record is cited by two people; Juho's baptism by one.
const MATTI = rippiCitation(5000, '1790 - 1796', 12, 'Matti Esimerkki');
const JUHO = baptismCitation(9, '25. Touko 1795', 'Juho Esimerkki');

function citationLines(c: { page: string; text: string }) {
  return [
    '1 SOUR @S1@',
    `2 PAGE ${c.page}`,
    '2 DATA',
    `3 TEXT ${c.text.replaceAll('\n', ' ')}`
  ];
}

async function importTree() {
  const gedcom = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @S1@ SOUR',
    '1 TITL Church books',
    '0 @I1@ INDI',
    '1 NAME Matti /Esimerkki/',
    ...citationLines(MATTI),
    '0 @I2@ INDI',
    '1 NAME Maija /Esimerkki/',
    ...citationLines(MATTI),
    '0 @I3@ INDI',
    '1 NAME Juho /Esimerkki/',
    ...citationLines(JUHO),
    '0 TRLR',
    ''
  ].join('\n');
  await importDataset({
    registry,
    slug: 'tree',
    source: { gedcom },
    sourceFilename: 'tree.ged'
  });
}

const LOCAL = {
  volumes: {
    'juva-1': {
      title: VOLUMES['juva-1'],
      pages: [{ image: 12, pages: [12], by: 'hand' }],
      ranges: [{ from: 5000, to: 5000 }],
      records: [
        {
          record: 5000,
          image: 12,
          by: 'vision',
          box: { left: 0.1, top: 0.5, width: 0.4, height: 0.05 },
          fileId: 'juva-1-f12'
        },
        { record: 7000, image: 3, by: 'hand' }
      ]
    }
  },
  references: {
    [JUHO.page]: {
      volumeId: 'juva-3',
      volume: VOLUMES['juva-3'],
      image: 15,
      by: 'hand',
      fileId: 'juva-3-f15'
    }
  },
  rejected: {
    [MATTI.page]: [{ volumeId: 'juva-1', image: 11, fileId: 'juva-1-f11' }]
  }
} satisfies Pins & { rejected: unknown };

const SIZE = { width: 1000, height: 2000 };

async function linksWith(pins: Pins, c: { page: string; text: string }) {
  const resolved = await resolveChurchBookRef(
    juvaAstia(),
    churchBookRefOf(c.page, c.text)!,
    pins
  );
  if (!('links' in resolved)) throw new Error(resolved.unlinked);
  return resolved.links;
}

test('moves pins into the citations of their record or URL, and lists the rest', async () => {
  await importTree();
  await Bun.write(join(root, 'pins.local.json'), JSON.stringify(LOCAL));
  const before = {
    matti: await linksWith(LOCAL, MATTI),
    juho: await linksWith(LOCAL, JUHO)
  };

  const result = await movePins(
    root,
    registry,
    async () => await Promise.resolve(SIZE)
  );
  expect(result).toEqual({
    moved: 3,
    left: ['Record pin 7000 (Volume juva-1, Image 3): no dataset cites it']
  });

  const db = registry.open('tree');
  expect(
    db
      .query(
        'SELECT scope_id, page, imported_page, link_volume_id, link_image, link_box_left, link_box_top, link_box_width, link_box_height, link_by FROM citations ORDER BY scope_id'
      )
      .all()
  ).toEqual([
    {
      scope_id: 1,
      page: MATTI.page,
      imported_page: null,
      link_volume_id: 'juva-1',
      link_image: 12,
      link_box_left: 100,
      link_box_top: 1000,
      link_box_width: 400,
      link_box_height: 100,
      link_by: 'vision'
    },
    expect.objectContaining({ scope_id: 2, link_image: 12, link_by: 'vision' }),
    {
      scope_id: 3,
      page: 'https://astia.narc.fi/uusiastia/viewer/?fileId=juva-3-f15&aineistoId=juva-3',
      imported_page: JUHO.page,
      link_volume_id: 'juva-3',
      link_image: 15,
      link_box_left: null,
      link_box_top: null,
      link_box_width: null,
      link_box_height: null,
      link_by: 'hand'
    }
  ]);
  expect(openMarks(db).rejectionsOf(MATTI.page)).toEqual([
    { volumeId: 'juva-1', image: 11, fileId: 'juva-1-f11' }
  ]);

  // What resolution made of the pins, it makes of the citations, the Box
  // now in pixels.
  const pins = await pinsOf(root, db, {
    astia: juvaAstia(),
    base: {}
  }).snapshot();
  expect(await linksWith(pins, MATTI)).toEqual(
    before.matti.map((l) => ({
      ...l,
      box: { left: 100, top: 1000, width: 400, height: 100 }
    }))
  );
  expect(await linksWith(pins, JUHO)).toEqual(before.juho);

  // The pins moved are gone from the file; the one no dataset cites, the
  // Page pins and the Record ranges stay (reading them gave the file ids).
  expect(await Bun.file(join(root, 'pins.local.json')).json()).toEqual({
    volumes: {
      'juva-1': {
        title: VOLUMES['juva-1'],
        pages: [{ image: 12, pages: [12], by: 'hand', fileId: 'juva-1-f12' }],
        ranges: [{ from: 5000, to: 5000 }],
        records: [{ record: 7000, image: 3, by: 'hand', fileId: 'juva-1-f3' }]
      }
    },
    references: {}
  });
});

test('leaves a pin whose Box has no Image size to convert it by', async () => {
  await importTree();
  await Bun.write(join(root, 'pins.local.json'), JSON.stringify(LOCAL));
  const result = await movePins(
    root,
    registry,
    async () => await Promise.resolve(null)
  );
  expect(result.left).toContain(
    'Record pin 5000 (Volume juva-1, Image 12): no size for its Image'
  );
  const kept = (await Bun.file(join(root, 'pins.local.json')).json()) as Pins;
  expect(kept.volumes['juva-1']!.records).toHaveLength(2);
});
