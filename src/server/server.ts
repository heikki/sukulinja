import { relative, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import type { FamilyRow, PersonRow } from '@common/types';

import type { DatasetRegistry } from './dataset-registry';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;

function parseYear(date: string | null): number | null {
  if (date === null) return null;
  const m = /(?<year>\d{4})/.exec(date);
  return m === null ? null : parseInt(m.groups!.year!, 10);
}

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers {
  handlePersons: () => Response;
  handleFamilies: () => Response;
  handleMedia: (rest: string, mediaRoot: string) => Promise<Response>;
}

function createDatasetHandlers(db: Database): DatasetHandlers {
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

  const listFamilies = db.prepare(
    'SELECT id, husband_id, wife_id FROM families'
  );
  const listFamilyChildren = db.prepare(
    'SELECT family_id, person_id FROM family_children ORDER BY family_id, sort_order'
  );

  return {
    handlePersons() {
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
    },

    handleFamilies() {
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
    },

    async handleMedia(rest, mediaRoot) {
      const rel = decodeURIComponent(rest.slice('/media/'.length));
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
  };
}

export function createApi(registry: DatasetRegistry): ApiHandlers {
  const handlersBySlug = new Map<string, DatasetHandlers>();

  function tryOpen(slug: string): Database | null {
    try {
      return registry.open(slug);
    } catch {
      return null;
    }
  }

  function getHandlers(slug: string): DatasetHandlers | null {
    const cached = handlersBySlug.get(slug);
    if (cached !== undefined) return cached;
    const db = tryOpen(slug);
    if (db === null) return null;
    const h = createDatasetHandlers(db);
    handlersBySlug.set(slug, h);
    return h;
  }

  return {
    async routeApi(_req, pathname) {
      if (pathname === '/datasets') {
        return Response.json(await registry.list());
      }
      const m = DATASET_RE.exec(pathname);
      if (m === null) return null;
      const slug = m.groups!.slug!;
      const rest = m.groups!.rest ?? '/';
      const handlers = getHandlers(slug);
      if (handlers === null) {
        return new Response('dataset not found', { status: 404 });
      }
      if (rest === '/api/persons') return handlers.handlePersons();
      if (rest === '/api/families') return handlers.handleFamilies();
      if (rest.startsWith('/media/')) {
        return await handlers.handleMedia(rest, registry.mediaDir(slug));
      }
      return null;
    }
  };
}

interface StaticFetchConfig {
  api: ApiHandlers;
  staticRoots: string[];
}

export function createStaticFetch(
  config: StaticFetchConfig
): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    const api = await config.api.routeApi(req, url.pathname);
    if (api !== null) return api;

    let path = decodeURIComponent(url.pathname);
    const m = DATASET_RE.exec(path);
    if (m !== null) path = m.groups!.rest ?? '/';
    if (path === '/') path = '/index.html';
    for (const root of config.staticRoots) {
      const file = Bun.file(`${root}${path}`);
      if (file.size > 0) return new Response(file);
    }
    return new Response('Not Found', { status: 404 });
  };
}
