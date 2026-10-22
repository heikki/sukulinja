import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CitationLink } from '../annotations';
import type { Astia } from './astia';
import { openMarks } from './marks';
import { memoryAstia } from './memory-astia';
import type { MemoryVolume } from './memory-astia';
import { churchBookRefOf, markKey, parseChurchBookRef } from './record';
import {
  JUVA,
  juvaAstia,
  rippiCitation as citation,
  VOLUMES
} from './test-parish';
import { citing, scansOf } from './test-pins';

let dir = '';
// The dataset citing every reference a test reads (refOf).
let db: Database = citing([]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scans-'));
  db = citing([], join(dir, 'db.sqlite'));
});
afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

// References resolved with the pins saved so far; Juva's archive as the
// test-parish gives it, unless another Astia is given.
function scans(astia: Astia = juvaAstia()) {
  return scansOf(dir, db, { astia });
}

// Juva's archive holding just these Volumes.
function juvaWith(volumes: MemoryVolume[]) {
  return memoryAstia({ [JUVA]: { volumes } });
}

async function writeLocal(volumes: unknown) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify({ volumes }));
}

// The citation's reference, the dataset citing it.
function refOf(c: { page: string; text: string }) {
  const cited = db
    .query('SELECT 1 FROM citations WHERE page = ? OR original_page = ?')
    .get(c.page, c.page);
  if (cited === null) {
    db.run(
      "INSERT INTO citations (scope_type, scope_id, page, text) VALUES ('person', 1, ?, ?)",
      [c.page, c.text]
    );
  }
  return churchBookRefOf(c.page, c.text)!;
}

// The dataset's citations of `c` hold the link, as a Mark or Match
// saved them.
function linkedAs(c: { page: string; text: string }, link: CitationLink) {
  openMarks(db).write(markKey(refOf(c)), link);
}

async function linksOf(c: { page: string; text: string }, astia?: Astia) {
  const resolved = await scans(astia).resolveRef(refOf(c));
  return 'links' in resolved ? resolved.links : resolved;
}

test('marking a record with a Record number saves a hand Record pin', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  await scans().markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 7,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
  const volume = (await scans().snapshot()).volumes['juva-1']!;
  expect(volume.records).toEqual([
    { record: 5000, image: 7, by: 'hand', fileId: 'juva-1-f7' }
  ]);
  expect(volume.pages).toEqual([
    {
      image: 7,
      pages: [12],
      note: 'marked in the app',
      by: 'hand',
      fileId: 'juva-1-f7'
    }
  ]);
});

test('a record marked in another Book gets a Reference pin and a Record pin there', async () => {
  const marked = citation(5000, '1790 - 1796', null);
  await scans().markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      image: 3,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
  expect(Object.values((await scans().snapshot()).references)).toEqual([
    {
      volumeId: 'juva-2',
      volume: VOLUMES['juva-2'],
      image: 3,
      by: 'hand',
      fileId: 'juva-2-f3'
    }
  ]);
  expect((await scans().snapshot()).volumes['juva-2']!.records).toEqual([
    { record: 5000, image: 3, by: 'hand', fileId: 'juva-2-f3' }
  ]);
});

test('a hand marking extends the Record range, routing records in between', async () => {
  await writeLocal({
    'juva-1': { pages: [], ranges: [{ from: 1000, to: 2000 }] },
    'juva-2': { pages: [], ranges: [{ from: 4000, to: 5000 }] }
  });
  const marked = citation(2500, '1790 - 1796', 40);
  await scans().markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  // Record 2200 cites the later Book, but its number puts it in juva-1 now.
  const between = citation(2200, '1797 - 1803', 30);
  expect(await linksOf(between)).toEqual([
    expect.objectContaining({ volumeId: 'juva-1' })
  ]);
  expect((await scans().snapshot()).volumes['juva-1']!.ranges).toEqual([
    { from: 1000, to: 2500 }
  ]);
});

test('a Record range is never extended across another Volume', async () => {
  await writeLocal({
    'juva-1': { pages: [], ranges: [{ from: 1000, to: 2000 }] },
    'juva-2': { pages: [], ranges: [{ from: 3000, to: 3500 }] }
  });
  const marked = citation(4000, '1790 - 1796', 40);
  await scans().markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 9,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
  const { volumes } = await scans().snapshot();
  expect(volumes['juva-1']!.ranges).toEqual([{ from: 1000, to: 2000 }]);
  expect(volumes['juva-2']!.ranges).toEqual([{ from: 3000, to: 3500 }]);
});

const BOX = { left: 100, top: 400, width: 500, height: 50 };
const JUVA_1 = { volumeId: 'juva-1', volume: VOLUMES['juva-1'] };

test('a hand marking replaces a Match', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  linkedAs(marked, { ...JUVA_1, image: 4, by: 'vision', box: BOX });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({ image: 4, certainty: 'match' })
  ]);
  await scans().markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      image: 7,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
});

test('a vision pin without a box is left out, a hand one without is Marked Image', async () => {
  linkedAs(citation(5000, '1790 - 1796', 12), {
    ...JUVA_1,
    image: 4,
    by: 'vision'
  });
  linkedAs(citation(5001, '1790 - 1796', 12), {
    ...JUVA_1,
    image: 6,
    by: 'hand'
  });
  expect(await linksOf(citation(5000, '1790 - 1796', 12))).toEqual([
    expect.objectContaining({ image: 12, certainty: 'estimated' })
  ]);
  expect(await linksOf(citation(5001, '1790 - 1796', 12))).toEqual([
    expect.objectContaining({
      image: 6,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
});

test('a Mark of only the Volume saves a hand Reference pin and nothing else', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  await scans().markRef(refOf(marked), { volumeId: 'juva-2' });

  const links = await linksOf(marked);
  expect(links).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      precision: 'volume',
      certainty: 'marked'
    })
  ]);
  const { volumes, references } = await scans().snapshot();
  expect(Object.values(references)).toEqual([
    { volumeId: 'juva-2', volume: VOLUMES['juva-2'], by: 'hand' }
  ]);
  expect(volumes['juva-2']).toBeUndefined();
});

test('a Mark of only the Volume replaces an Image Mark, and an Image Mark replaces it', async () => {
  const marked = citation(5000, '1790 - 1796', null);
  const s = scans();
  await s.markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });
  await s.markRef(refOf(marked), { volumeId: 'juva-1' });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({ volumeId: 'juva-1', precision: 'volume' })
  ]);
  await s.markRef(refOf(marked), { volumeId: 'juva-1', image: 5 });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 5,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
});

test('a Mark of only the Volume is refused outside the parish, and an Image only past its Images', async () => {
  const ref = refOf(citation(5000, '1790 - 1796', 12));
  expect(await scans().markRef(ref, { volumeId: 'elsewhere' })).toEqual({
    rejected: "That Volume isn't in this parish's church books."
  });
  expect(await scans().markRef(ref, { volumeId: 'juva-1', image: 21 })).toEqual(
    { rejected: 'The volume has images 1–20.' }
  );
});

test('an entry box must lie on its Image', async () => {
  const ref = refOf(citation(5000, '1790 - 1796', 12));
  const box = { left: 800, top: 500, width: 300, height: 50 };
  // An Image 1000 pixels wide.
  const sized = scansOf(dir, db, {
    astia: juvaAstia(),
    sizeOf: async () => await Promise.resolve({ width: 1000, height: 800 })
  });
  const off = 'The entry box must lie on the Image, in whole pixels.';
  expect(
    await sized.markRef(ref, { volumeId: 'juva-1', image: 7, box })
  ).toEqual({ rejected: off });
  expect(
    await sized.markRef(ref, {
      volumeId: 'juva-1',
      image: 7,
      box: { ...box, left: 100.5 }
    })
  ).toEqual({ rejected: off });
  expect(
    await sized.markRef(ref, {
      volumeId: 'juva-1',
      box: { ...box, left: 100 }
    })
  ).toEqual({ rejected: 'An entry box needs its Image.' });
  const marked = await sized.markRef(ref, {
    volumeId: 'juva-1',
    image: 7,
    box: { ...box, left: 100 }
  });
  expect(marked).toMatchObject({ links: [{ precision: 'entry', image: 7 }] });
});

test("the Volumes to choose from are the cited Book's, those it links first", async () => {
  const ref = refOf(citation(5000, '1797 - 1803', 12));
  const choices = await scans().volumeChoices(ref);
  expect(choices).toEqual({
    fits: [
      {
        id: 'juva-2',
        label: VOLUMES['juva-2'],
        years: { from: 1797, to: 1803 }
      }
    ],
    others: [
      {
        id: 'juva-1',
        label: VOLUMES['juva-1'],
        years: { from: 1790, to: 1796 }
      }
    ]
  });
  // Its own pin doesn't move it out of what fits.
  await scans().markRef(ref, { volumeId: 'juva-1' });
  expect((await scans().volumeChoices(ref)).fits.map((v) => v.id)).toEqual([
    'juva-2'
  ]);
});

test('the Volumes to choose from leave out those not digitized', async () => {
  const astia = juvaWith([
    { id: 'r1', label: VOLUMES['juva-1'], images: 20 },
    { id: 'r2', label: VOLUMES['juva-2'], images: 0, digitized: false }
  ]);
  const ref = refOf(citation(5000, '1790 - 1796', 12));
  const choices = await scans(astia).volumeChoices(ref);
  expect(choices.others).toEqual([]);
  expect(choices.fits.map((v) => v.id)).toEqual(['r1']);
});

test('a Reference pin without an Image marks only the Volume', async () => {
  const cited = citation(5000, '1790 - 1796', null);
  const reference = { ...cited, page: cited.page.replace('itemId=5000&', '') };
  linkedAs(reference, {
    volumeId: 'juva-2',
    volume: VOLUMES['juva-2'],
    by: 'hand'
  });
  const links = await linksOf(reference);
  expect(links).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      precision: 'volume',
      certainty: 'marked'
    })
  ]);
  expect(links).not.toContainEqual(expect.objectContaining({ image: 1 }));
});

test('confirming a Match by hand keeps its box', async () => {
  const box = BOX;
  const marked = citation(5000, '1790 - 1796', 12);
  linkedAs(marked, {
    ...JUVA_1,
    image: 4,
    by: 'vision',
    box,
    fileId: 'juva-1-f4'
  });
  await scans().markRef(refOf(marked), { volumeId: 'juva-1', image: 4 });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      image: 4,
      precision: 'entry',
      certainty: 'marked',
      box
    })
  ]);
});

test('a vision Reference pin confirmed by hand keeps its box', async () => {
  const box = BOX;
  // Vision Reference pins are of references with no Record number.
  const cited = citation(5000, '1790 - 1796', null);
  const marked = { ...cited, page: cited.page.replace('itemId=5000&', '') };
  linkedAs(marked, {
    volumeId: 'juva-2',
    volume: VOLUMES['juva-2'],
    image: 3,
    by: 'vision',
    box
  });
  await scans().markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });
  expect(Object.values((await scans().snapshot()).references)).toEqual([
    {
      volumeId: 'juva-2',
      volume: VOLUMES['juva-2'],
      image: 3,
      by: 'hand',
      box,
      fileId: 'juva-2-f3'
    }
  ]);
});

test('the matcher searches the Volumes a reference links', async () => {
  const index = parseChurchBookRef(
    'https://www.myheritage.fi/research/collection-30233/x?itemId=9',
    'Juho Esimerkki\nRistiäiset: 29. Marras 1795 - Juva, Mikkeli, Finland'
  );
  expect(await scans().matchCandidates(index)).toEqual([
    {
      volumeId: 'juva-3',
      volume: VOLUMES['juva-3'],
      images: 20,
      years: { from: 1790, to: 1810 },
      start: null
    }
  ]);
  const rippi = citation(5000, '1790 - 1796', 12);
  expect(
    await scans().matchCandidates(parseChurchBookRef(rippi.page, rippi.text))
  ).toEqual([
    {
      volumeId: 'juva-1',
      volume: VOLUMES['juva-1'],
      images: 20,
      years: { from: 1790, to: 1796 },
      start: 12
    }
  ]);
});

// ---------------------------------------------------------------- choosing the Volume

// The Volumes a reference links, by id.
async function volumesOf(c: { page: string; text: string }, astia: Astia) {
  const links = await linksOf(c, astia);
  return 'unlinked' in links ? links : links.map((l) => l.volumeId);
}

test("a Volume's Parts leave out the years in its gaps", async () => {
  const astia = juvaWith([
    {
      id: 'juva-p',
      label: 'I Aa:3 Pää- ja rippikirjat, 1790-1792, 1795-1796 (1790-1796)',
      images: 20
    },
    {
      id: 'juva-q',
      label: 'I Aa:4 Pää- ja rippikirjat (1793-1794)',
      images: 20
    }
  ]);
  expect(await volumesOf(citation(5000, '1793 - 1793', 5), astia)).toEqual([
    'juva-q'
  ]);
  expect(await volumesOf(citation(5001, '1791 - 1791', 5), astia)).toEqual([
    'juva-p'
  ]);
});

test("a page past a Volume's Page pins goes to the Volume continuing it", async () => {
  // Pages 1–20 in the first Volume, 21–40 in the second.
  const astia = juvaWith([
    {
      id: 'juva-a',
      label: 'I Aa:1a Pää- ja rippikirjat (1790-1796)',
      images: 20
    },
    {
      id: 'juva-b',
      label: 'I Aa:1b Pää- ja rippikirjat (1790-1796)',
      images: 20
    }
  ]);
  await writeLocal({
    'juva-a': { pages: [{ image: 20, pages: [20] }] },
    'juva-b': { pages: [{ image: 1, pages: [21] }] }
  });
  expect(await linksOf(citation(5000, '1790 - 1796', 30), astia)).toEqual([
    expect.objectContaining({ volumeId: 'juva-b', image: 10, from: 'pins' })
  ]);
  expect(await linksOf(citation(5001, '1790 - 1796', 5), astia)).toEqual([
    expect.objectContaining({ volumeId: 'juva-a', image: 5, from: 'pins' })
  ]);
});

test("Volumes split by villages link the one holding the reference's village", async () => {
  const astia = juvaWith([
    {
      id: 'juva-h',
      label: 'I Aa:3 Pää- ja rippikirjat, Hankamäki - Orala (1790-1796)',
      images: 20
    },
    {
      id: 'juva-p',
      label: 'I Aa:4 Pää- ja rippikirjat, Pajula - Ö (1790-1796)',
      images: 20
    }
  ]);
  const cited = citation(5000, '1790 - 1796', 5);
  expect(
    await volumesOf({ ...cited, text: `${cited.text}\nKylä:Pajula` }, astia)
  ).toEqual(['juva-p']);
  expect(
    await volumesOf({ ...cited, text: `${cited.text}\nKylä:Kaipola` }, astia)
  ).toEqual(['juva-h']);
  // No village given: the split stands.
  expect(await volumesOf(cited, astia)).toEqual(['juva-h', 'juva-p']);
});

test("Links name the Volume's archive, as does a reference whose Volume isn't digitized", async () => {
  const astia = memoryAstia({
    [JUVA]: {
      title: 'Juvan seurakunnan arkisto',
      volumes: [
        { id: 'juva-1', label: VOLUMES['juva-1'], images: 20 },
        { id: 'juva-2', label: VOLUMES['juva-2'], images: 20, digitized: false }
      ]
    }
  });
  expect(await linksOf(citation(5000, '1790 - 1796', 5), astia)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      archive: 'Juvan seurakunnan arkisto'
    })
  ]);
  expect(await linksOf(citation(5001, '1797 - 1803', 5), astia)).toEqual({
    unlinked: 'not-digitized',
    archive: 'Juvan seurakunnan arkisto'
  });
});

test('says why a reference has no Link', async () => {
  const cited = citation(5000, '1790 - 1796', 5);
  const elsewhere = cited.text.replace('Hallintoalue:Juva', 'Hallintoalue:Ei');
  expect(await linksOf({ ...cited, text: 'Matti Esimerkki' })).toEqual({
    unlinked: 'unparsed'
  });
  expect(await linksOf({ ...cited, text: elsewhere })).toEqual({
    unlinked: 'no-archive'
  });
  expect(await linksOf(citation(5001, '1700 - 1701', 5))).toEqual({
    unlinked: 'no-volume'
  });
  const empty = juvaWith([
    { id: 'juva-1', label: VOLUMES['juva-1'], images: 0 }
  ]);
  expect(await linksOf(cited, empty)).toEqual({ unlinked: 'no-images' });
});

test('Astia failing is a reason for now; any other error is thrown on', async () => {
  const cited = citation(5000, '1790 - 1796', 5);
  const down = memoryAstia({}, { down: true });
  expect(await linksOf(cited, down)).toEqual({ unlinked: 'astia-error' });
  expect(down.asked).toEqual([`volumes ${JUVA}`]);
  // An Astia without Juva's archive is a mistake, not an outage.
  const failed = await scans(memoryAstia({}))
    .resolveRef(refOf(cited))
    .then(() => 'resolved')
    .catch((err: unknown) => String(err));
  expect(failed).toBe(`Error: no archive ${JUVA} in this Astia`);
});
