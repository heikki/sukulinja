import { relative, resolve } from 'node:path';

import indexHtml from '@client/index.html';
import type { FamilyRow, PersonRow } from '@common/types';

import { openDb } from './db';

const PROJECT_ROOT = resolve(import.meta.dir, '..', '..');
const DEFAULT_MEDIA_BASE = resolve(PROJECT_ROOT, '..', 'myheritage-export');

function parseYear(date: string | null): number | null {
  if (date === null) return null;
  const m = /(?<year>\d{4})/.exec(date);
  return m === null ? null : parseInt(m.groups!.year!, 10);
}

export function createServer() {
  const db = openDb();
  const mediaRoot = resolve(DEFAULT_MEDIA_BASE, 'media');

  const listPersons = db.prepare(`
    SELECT
      p.id,
      n.given,
      n.surname,
      p.sex,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='BIRT' LIMIT 1) AS birth_date,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='DEAT' LIMIT 1) AS death_date,
      (
        SELECT m.file_path FROM media_links ml
        JOIN media m ON m.id = ml.media_id
        WHERE ml.scope_type='person' AND ml.scope_id=p.id
        ORDER BY ml.is_primary DESC, ml.sort_order ASC
        LIMIT 1
      ) AS photo_path
    FROM persons p
    LEFT JOIN names n ON n.person_id = p.id AND n.sort_order = 0
    ORDER BY n.surname COLLATE NOCASE, n.given COLLATE NOCASE
  `);

  type ListRow = Omit<PersonRow, 'birth_year' | 'death_year'> & {
    birth_date: string | null;
    death_date: string | null;
  };

  function handlePersons(): Response {
    const rows = listPersons.all() as ListRow[];
    const out: PersonRow[] = rows.map((r) => ({
      id: r.id,
      given: r.given,
      surname: r.surname,
      sex: r.sex,
      birth_year: parseYear(r.birth_date),
      death_year: parseYear(r.death_date),
      photo_path: r.photo_path
    }));
    return Response.json(out);
  }

  const listFamilies = db.prepare(
    'SELECT id, husband_id, wife_id FROM families'
  );
  const listFamilyChildren = db.prepare(
    'SELECT family_id, person_id FROM family_children ORDER BY family_id, sort_order'
  );

  function handleFamilies(): Response {
    const fams = listFamilies.all() as Array<Omit<FamilyRow, 'child_ids'>>;
    const kids = listFamilyChildren.all() as Array<{
      family_id: number;
      person_id: number;
    }>;
    const childrenByFamily = new Map<number, number[]>();
    for (const k of kids) {
      let arr = childrenByFamily.get(k.family_id);
      if (arr === undefined) {
        arr = [];
        childrenByFamily.set(k.family_id, arr);
      }
      arr.push(k.person_id);
    }
    const out: FamilyRow[] = fams.map((f) => ({
      id: f.id,
      husband_id: f.husband_id,
      wife_id: f.wife_id,
      child_ids: childrenByFamily.get(f.id) ?? []
    }));
    return Response.json(out);
  }

  async function handleFetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/media/')) {
      return new Response('not found', { status: 404 });
    }
    const rel = decodeURIComponent(url.pathname.slice('/media/'.length));
    const fullPath = resolve(mediaRoot, rel);
    if (relative(mediaRoot, fullPath).startsWith('..')) {
      return new Response('forbidden', { status: 403 });
    }
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return new Response('not found', { status: 404 });
    }
    return new Response(file);
  }

  return Bun.serve({
    port: 0,
    routes: {
      '/': indexHtml,
      '/api/persons': handlePersons,
      '/api/families': handleFamilies
    },
    fetch: handleFetch
  });
}
