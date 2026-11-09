// The Citations with no References port behind them: a dataset whose
// Citations are all Citations of Images, as once no reference is left.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CitationLinks, Link } from '@/common/types';

import { openDb } from '../datasets/db';
import { openAnnotations } from './annotations';
import { fileId } from './astia/memory-astia';
import { juvaAstia } from './astia/test-parish';
import { createCitations } from './citations';
import { openImages } from './images';
import { noReferences } from './references';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'references-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BOX = { left: 100, top: 200, width: 500, height: 50 };
const VOLUME = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';

async function linesOf(lines: AsyncIterable<CitationLinks>) {
  const out: CitationLinks[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

test('with no references, a Citation of an Image is listed and linked by its stored Link', async () => {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
  const file = fileId('juva-1', 13, 'full');
  const page = `https://astia.narc.fi/uusiastia/viewer/?fileId=${file}&aineistoId=juva-1`;
  openAnnotations(db).insert(
    {
      scopeType: 'person',
      scopeId: 1,
      sourceId: null,
      sortOrder: 0,
      page,
      event: null,
      role: null,
      quality: null,
      dataDate: null,
      // MyHeritage's page in the text reads as text, not as a record.
      text: 'https://www.myheritage.fi/research/collection-10509/x?itemId=5'
    },
    {
      link: {
        volumeId: 'juva-1',
        volume: VOLUME,
        image: 13,
        fileId: file,
        box: BOX,
        by: 'hand'
      },
      originalPage: null,
      madeInApp: true
    }
  );
  const images = openImages({ astia: juvaAstia() });
  const citations = createCitations(db, { images, references: noReferences });

  const [row] = citations.ofPerson(1);
  expect(row).toMatchObject({
    churchBook: true,
    reference: null,
    entry: 'Image 13',
    record: null
  });
  const link: Link = {
    volumeId: 'juva-1',
    volume: VOLUME,
    url: page,
    precision: 'entry',
    image: 13,
    box: BOX,
    certainty: 'marked'
  };
  expect(await linesOf(citations.linksOf(1))).toEqual([
    { citationId: row!.id, links: [link] }
  ]);
  expect(await citations.inVolume('juva-1')).toMatchObject([
    { personId: 1, link }
  ]);
  expect(await citations.volumeChoices(row!.id)).toBeNull();
});
