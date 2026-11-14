// The Entry module (ADR-0026), through its interface: an Entry made with
// everyone it names, edited as a whole or not at all, a person unnamed,
// and the Entry removed, with the Changes each writes.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VolumeCitation } from '@/common/types';

import type { NewChange } from '../../changes/changes';
import { openDb } from '../../datasets/db';
import { fileId } from '../astia/memory-astia';
import { memoryParishes } from '../astia/parishes';
import { juvaAstia, VOLUMES } from '../astia/test-parish';
import { createCitations } from '../citations';
import { openImages } from '../images';
import { referencesFor } from '../myheritage/test-pins';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entries-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BAPTISMS = VOLUMES['juva-3'];
const BOX = { left: 100, top: 200, width: 500, height: 50 };
const MOVED = { left: 50, top: 60, width: 400, height: 40 };

// An entry on Image `image` of the baptisms, as the Scan viewer gives it.
function at(image: number, box = BOX) {
  return {
    volumeId: 'juva-3',
    image,
    fileId: fileId('juva-3', image, 'full'),
    box
  };
}

// Matti (1) and Liisa (2), married in family 1; Juho (3) and Kalle (4) in
// none. Matti has a Birth (1) and a Christening (2). Each of the first
// three has a Citation of their own, by their id. Images 1000×800 pixels.
function dataset() {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run(`INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'),
    (3, '@I3@'), (4, '@I4@')`);
  db.run(
    "INSERT INTO families (id, xref, husband_id, wife_id) VALUES (1, '@F1@', 1, 2)"
  );
  db.run(`INSERT INTO facts (id, scope_type, scope_id, tag, date_text)
    VALUES (1, 'person', 1, 'BIRT', '3 MAR 1795'),
      (2, 'person', 1, 'CHR', '12 MAR 1795')`);
  db.run(`INSERT INTO citations (id, scope_type, scope_id, text)
    VALUES (1, 'person', 1, 'Matti'), (2, 'person', 2, 'Liisa'),
      (3, 'person', 3, 'Juho')`);
  const astia = juvaAstia();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const changes: NewChange[] = [];
  const citations = createCitations(db, {
    images: openImages({ astia, parishes: memoryParishes(), sizeOf }),
    references: referencesFor(dir, db, { astia, sizeOf }),
    changed: (c) => {
      changes.push(c);
    }
  });
  return { db, citations, entries: citations.entries, changes };
}

type Citations = ReturnType<typeof dataset>['citations'];

// Who an Entry names, and where it is and what it says, as the Scan
// viewer lists its Citations.
function shown(rows: VolumeCitation[]) {
  return rows.map((r) => ({
    personId: r.personId,
    citationId: r.citation.id,
    role: r.citation.role,
    text: r.citation.text,
    image: 'image' in r.link ? r.link.image : null,
    box: 'box' in r.link ? r.link.box : null
  }));
}

async function entryNow(citations: Citations, entryId: number) {
  const rows = (await citations.inVolume('juva-3')) ?? [];
  return shown(rows.filter((r) => r.citation.entryId === entryId));
}

function made(rows: VolumeCitation[] | { rejected: string } | null) {
  if (rows === null || 'rejected' in rows) throw new Error('not made');
  return rows;
}

function count(db: ReturnType<typeof openDb>, table: string) {
  return db
    .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`)
    .get()!.n;
}

test('an Entry is made naming its people at once, one Box for all, and its child has its support', async () => {
  const { db, entries, changes } = dataset();
  expect(
    await entries.make(at(3), 'x', [
      { personId: 1, role: 'CHIL' },
      { personId: 1, role: 'FATH' }
    ])
  ).toEqual({ rejected: 'Someone is named twice.' });
  expect(
    await entries.make(at(3), 'x', [{ personId: 1, role: 'HUSB' }])
  ).toEqual({ rejected: "That isn't a Role in this kind of entry." });
  expect(await entries.make(at(3), 'x', [])).toEqual({
    rejected: 'Name someone in it.'
  });
  expect(
    await entries.make(at(3), 'x', [{ personId: 9, role: 'CHIL' }])
  ).toBeNull();

  const rows = made(
    await entries.make(at(3), ' Kaste  12.3.1795 \n', [
      { personId: 1, role: 'CHIL' },
      { personId: 3, role: 'FATH' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  expect(shown(rows)).toMatchObject([
    { personId: 1, role: 'CHIL', text: 'Kaste 12.3.1795', image: 3, box: BOX },
    { personId: 3, role: 'FATH', text: 'Kaste 12.3.1795', image: 3, box: BOX },
    { personId: 2, role: 'MOTH', text: 'Kaste 12.3.1795', image: 3, box: BOX }
  ]);
  expect(new Set(rows.map((r) => r.citation.entryId)).size).toBe(1);
  expect(rows.map((r) => r.citation.supports)).toEqual([[2], [], []]);
  expect(changes.map((c) => c.what.kind)).toEqual([
    'cite',
    'support',
    'cite',
    'cite'
  ]);
  expect(count(db, 'entries')).toBe(1);
});

test('one edit moves the Box, retypes it, and names and unnames people, with a Change on each Citation', async () => {
  const { entries, citations, changes } = dataset();
  const [child, mother] = made(
    await entries.make(at(3), 'Kaste 12.3.1795', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = child!.citation.entryId!;
  changes.length = 0;

  const after = made(
    await entries.edit(entryId, {
      at: at(4, MOVED),
      text: ' Kaste  13.3.1795 ',
      people: [
        { personId: 1, role: 'CHIL' },
        { personId: 3, role: 'FATH' }
      ]
    })
  );
  const juho = after.find((r) => r.personId === 3)!.citation.id;
  const now = [
    {
      personId: 1,
      citationId: child!.citation.id,
      role: 'CHIL',
      text: 'Kaste 13.3.1795',
      image: 4,
      box: MOVED
    },
    {
      personId: 3,
      citationId: juho,
      role: 'FATH',
      text: 'Kaste 13.3.1795',
      image: 4,
      box: MOVED
    }
  ];
  expect(shown(after)).toEqual(now);
  expect(await entryNow(citations, entryId)).toEqual(now);
  // Liisa's Citation of it is gone; her own stays.
  expect(citations.ofPerson(2).map((c) => c.id)).toEqual([2]);
  expect(citations.ofPerson(2).some((c) => c.id === mother!.citation.id)).toBe(
    false
  );

  expect(changes).toEqual([
    {
      on: { citationId: juho },
      what: { kind: 'cite', volume: BAPTISMS, image: 4 }
    },
    {
      on: { personId: 2 },
      what: { kind: 'uncite', cited: `${BAPTISMS}, Image\u00a03` }
    },
    {
      on: { citationId: child!.citation.id },
      what: { kind: 'move', volume: BAPTISMS, image: 4 }
    },
    {
      on: { citationId: child!.citation.id },
      what: {
        kind: 'transcribe',
        volume: BAPTISMS,
        image: 4,
        text: 'Kaste 13.3.1795'
      }
    }
  ]);
});

test('a Box moved or a Transcription retyped is a Change on each of its Citations, and a part left as it was none', async () => {
  const { entries, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  const ids = rows.map((r) => r.citation.id);
  changes.length = 0;

  made(await entries.edit(entryId, { at: at(3, MOVED) }));
  made(await entries.edit(entryId, { text: 'Kaste 1795' }));
  // The same again, and no part at all, change nothing.
  made(await entries.edit(entryId, { at: at(3, MOVED), text: 'Kaste 1795' }));
  made(await entries.edit(entryId, {}));
  expect(changes).toEqual([
    ...ids.map((id) => ({
      on: { citationId: id },
      what: { kind: 'move' as const, volume: BAPTISMS, image: 3 }
    })),
    ...ids.map((id) => ({
      on: { citationId: id },
      what: {
        kind: 'transcribe' as const,
        volume: BAPTISMS,
        image: 3,
        text: 'Kaste 1795'
      }
    }))
  ]);
});

test('an edit with one part refused writes nothing', async () => {
  const { db, entries, citations, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  const before = await entryNow(citations, entryId);
  const citationCount = count(db, 'citations');
  changes.length = 0;

  const moved = { at: at(4, MOVED), text: 'Kaste 13.3.1795' };
  expect(
    await entries.edit(entryId, {
      ...moved,
      people: [
        { personId: 1, role: 'CHIL' },
        { personId: 3, role: 'HUSB' }
      ]
    })
  ).toEqual({ rejected: "That isn't a Role in this kind of entry." });
  expect(
    await entries.edit(entryId, {
      ...moved,
      people: [
        { personId: 3, role: 'FATH' },
        { personId: 3, role: 'CHIL' }
      ]
    })
  ).toEqual({ rejected: 'Someone is named twice.' });
  expect(await entries.edit(entryId, { ...moved, people: [] })).toEqual({
    rejected: 'Name someone in it.'
  });
  expect(
    await entries.edit(entryId, {
      text: 'x',
      at: at(4, { ...MOVED, width: 990 })
    })
  ).toEqual({
    rejected: 'The entry box must lie on the Image, in whole pixels.'
  });
  expect(
    await entries.edit(entryId, {
      text: 'x',
      at: { ...at(2), volumeId: 'juva-1', fileId: fileId('juva-1', 2, 'full') }
    })
  ).toEqual({ rejected: 'An entry stays in its Volume.' });
  expect(
    await entries.edit(entryId, {
      ...moved,
      people: [{ personId: 9, role: 'FATH' }]
    })
  ).toBeNull();
  expect(await entries.edit(99, moved)).toBeNull();

  expect(await entryNow(citations, entryId)).toEqual(before);
  expect(count(db, 'citations')).toBe(citationCount);
  expect(changes).toEqual([]);
});

test("a Role changed keeps the person's Citation, with its notes and support, and adds what the new Role gives", async () => {
  const { db, entries, citations, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'FATH' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  const matti = rows[0]!.citation.id;
  db.run(
    "INSERT INTO notes (owner_type, owner_id, text) VALUES ('citation', ?, 'Seen')",
    [matti]
  );
  citations.support(matti, 1, true);
  changes.length = 0;

  const after = made(
    await entries.edit(entryId, {
      people: [
        { personId: 1, role: 'CHIL' },
        { personId: 2, role: 'MOTH' }
      ]
    })
  );
  expect(after.map((r) => [r.citation.id, r.citation.role])).toEqual([
    [matti, 'CHIL'],
    [rows[1]!.citation.id, 'MOTH']
  ]);
  // His Birth stays, and the child's Christening is added.
  expect(after[0]!.citation.supports).toEqual([1, 2]);
  expect(
    db.query("SELECT text FROM notes WHERE owner_type = 'citation'").all()
  ).toEqual([{ text: 'Seen' }]);
  expect(changes).toEqual([
    {
      on: { citationId: matti },
      what: {
        kind: 'role',
        volume: BAPTISMS,
        image: 3,
        from: 'FATH',
        to: 'CHIL'
      }
    },
    {
      on: { citationId: matti },
      what: { kind: 'support', did: 'add', tag: 'CHR', fact: '12.3.1795' }
    }
  ]);

  // Back to the father: none is taken back.
  const back = made(
    await entries.edit(entryId, {
      people: [
        { personId: 1, role: 'FATH' },
        { personId: 2, role: 'MOTH' }
      ]
    })
  );
  expect(back[0]!.citation).toMatchObject({
    id: matti,
    role: 'FATH',
    supports: [1, 2]
  });
});

test('a move onto an Image someone it names already cites is refused, its own Citations not counting', async () => {
  const { entries } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  made(await entries.make(at(5), 'Kaste', [{ personId: 2, role: 'MOTH' }]));

  const already = { rejected: 'Their Citations already link this Image.' };
  expect(await entries.edit(entryId, { at: at(5, MOVED) })).toEqual(already);
  // Kalle has none there, but naming him there is refused all the same,
  // for Liisa.
  expect(
    await entries.edit(entryId, {
      at: at(5, MOVED),
      people: [
        { personId: 2, role: 'MOTH' },
        { personId: 4, role: 'FATH' }
      ]
    })
  ).toEqual(already);
  // On its own Image it's moved and named in as it is.
  expect(
    shown(
      made(
        await entries.edit(entryId, {
          at: at(3, MOVED),
          people: [
            { personId: 1, role: 'CHIL' },
            { personId: 2, role: 'MOTH' },
            { personId: 4, role: 'FATH' }
          ]
        })
      )
    ).map((r) => [r.personId, r.image])
  ).toEqual([
    [1, 3],
    [2, 3],
    [4, 3]
  ]);
});

test('unnaming the last person in an Entry removes it', async () => {
  const { db, entries, citations, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const [child, mother] = rows.map((r) => r.citation.id);
  changes.length = 0;

  expect(entries.unname(child!)).toMatchObject({
    personId: 1,
    citation: { id: child }
  });
  expect(count(db, 'entries')).toBe(1);
  // Through `uncite` too.
  expect(citations.uncite(mother!)).toMatchObject({ personId: 2 });
  expect(count(db, 'entries')).toBe(0);
  expect(changes.map((c) => [c.on, c.what.kind])).toEqual([
    [{ personId: 1 }, 'uncite'],
    [{ personId: 2 }, 'uncite']
  ]);
  // A Citation of no Entry isn't one to unname.
  expect(entries.unname(1)).toBeNull();
  expect(entries.unname(child!)).toBeNull();
});

test('an Entry is removed with all its Citations, a Change on each', async () => {
  const { db, entries, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 3, role: 'FATH' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  changes.length = 0;

  expect(entries.remove(entryId)).toBe(3);
  expect(changes.map((c) => [c.on, c.what.kind])).toEqual([
    [{ personId: 1 }, 'uncite'],
    [{ personId: 3 }, 'uncite'],
    [{ personId: 2 }, 'uncite']
  ]);
  expect(count(db, 'entries')).toBe(0);
  expect(count(db, 'fact_citations')).toBe(0);
  expect(entries.remove(entryId)).toBeNull();
});

test('retyping a Citation of an Entry retypes the Entry, for everyone in it', async () => {
  const { entries, citations, changes } = dataset();
  const rows = made(
    await entries.make(at(3), 'Kaste', [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  changes.length = 0;
  expect(
    await citations.retext(rows[1]!.citation.id, 'Kaste\n 3.2.1790')
  ).toEqual({ text: 'Kaste\n3.2.1790' });
  expect(citations.ofPerson(1).map((c) => c.text)).toContain('Kaste\n3.2.1790');
  expect(changes.map((c) => [c.on, c.what.kind])).toEqual([
    [{ citationId: rows[0]!.citation.id }, 'transcribe'],
    [{ citationId: rows[1]!.citation.id }, 'transcribe']
  ]);
});
