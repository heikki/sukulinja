import type { Database } from 'bun:sqlite';
import { relative, resolve } from 'node:path';

import type { NewChange, Reminder } from '@/common/types';

import { openChanges } from './changes/changes';
import type { Changes } from './changes/changes';
import { openCitations } from './citations';
import type { Astia, DatasetCitations } from './citations';
import { lifecycleRoutes } from './datasets/lifecycle-routes';
import type { DatasetRegistry } from './datasets/registry';
import { createPersonDetails } from './person-details';
import { createPhotos, openTags, routePhotos } from './photos';
import type { Photos, Tags } from './photos';
import { createReminders } from './reminders/reminders';
import { routeReminders } from './reminders/routes';
import type { ReminderHandlers } from './reminders/routes';
import { createTree } from './tree';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers extends ReminderHandlers {
  // The dataset's Changes, which the rest of the app writes into.
  changes: Changes;
  handleChanges: () => Promise<Response>;
  handlePersons: () => Response;
  handleFamilies: () => Response;
  handlePerson: (id: number) => Response;
  handleMedia: (rest: string, mediaRoot: string) => Promise<Response>;
  // The Citation routes; null for any other path.
  routeCitations: DatasetCitations['route'];
  // The dataset's Photos, and tagging people in them.
  photos: Photos;
  tags: Tags;
}

function createDatasetHandlers(
  db: Database,
  scans: DatasetCitations
): DatasetHandlers {
  const tree = createTree(db);
  const personDetails = createPersonDetails(db, scans);
  const reminders = createReminders(db, scans);
  const changes = openChanges(db, scans);
  const photos = createPhotos(db);
  const tags = openTags(db, photos, (change) => {
    changes.add(change);
  });

  // A Reminder as written or changed, or why not.
  function answerReminder(
    result: Reminder | { rejected: string } | null,
    missing: string,
    status = 200
  ) {
    if (result === null) return new Response(missing, { status: 404 });
    return 'rejected' in result
      ? new Response(result.rejected, { status: 400 })
      : Response.json(result, { status });
  }

  return {
    changes,

    async handleChanges() {
      return Response.json(await changes.list());
    },

    handlePersons() {
      return Response.json(tree.persons());
    },

    handleFamilies() {
      return Response.json(tree.families());
    },

    handlePerson(id) {
      const details = personDetails(id);
      return details === null
        ? new Response('person not found', { status: 404 })
        : Response.json(details);
    },

    routeCitations: scans.route,

    photos,
    tags,

    async handleReminders() {
      return Response.json(await reminders.list());
    },

    async handleRemind(text, target) {
      return answerReminder(
        await reminders.add(text, target),
        'person not found',
        201
      );
    },

    async handleChangeReminder(id, change) {
      return answerReminder(
        await reminders.change(id, change),
        'reminder not found'
      );
    },

    handleDeleteReminder(id) {
      return reminders.remove(id)
        ? new Response(null, { status: 204 })
        : new Response('reminder not found', { status: 404 });
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

async function routeDataset(
  req: Request,
  handlers: DatasetHandlers,
  rest: string,
  mediaRoot: string
): Promise<Response | null> {
  if (rest === '/api/persons') return handlers.handlePersons();
  if (rest === '/api/families') return handlers.handleFamilies();
  if (rest === '/api/changes') return await handlers.handleChanges();
  const person = /^\/api\/persons\/(?<id>\d+)$/.exec(rest);
  if (person !== null) return handlers.handlePerson(Number(person.groups!.id));
  const cited = await handlers.routeCitations(req, rest);
  if (cited !== null) return cited;
  const reminded = await routeReminders(req, handlers, rest);
  if (reminded !== null) return reminded;
  const photo = await routePhotos(req, handlers, rest);
  if (photo !== null) return photo;
  if (rest.startsWith('/media/')) {
    return await handlers.handleMedia(rest, mediaRoot);
  }
  return null;
}

interface ApiOptions {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string;
  // Whether each dataset, once opened, asks Astia in the background for
  // what its references resolve against.
  warmUp?: boolean;
}

export function createApi(
  registry: DatasetRegistry,
  options: ApiOptions = {}
): ApiHandlers {
  const scans = openCitations(registry.root, {
    astia: options.astia,
    warmUp: options.warmUp,
    datasets: async () => await openDatasets(),
    changed
  });
  // Kept by the Database they're bound to: the registry alone decides when
  // a dataset's Database is closed and replaced (by an import or a delete),
  // and the next request then opens the new one and gets new handlers.
  const handlersByDb = new WeakMap<Database, DatasetHandlers>();
  const routeLifecycle = lifecycleRoutes(registry, {
    exportDir: options.exportDir,
    // Not into one an older version built, as undoing its first import
    // since then puts back.
    changed: (slug, change) => {
      const db = tryOpen(slug);
      if (db !== null) changed(db, change);
    }
  });

  // Writes a Change into the dataset whose Database it is.
  function changed(db: Database, change: NewChange) {
    handlersOf(db).changes.add(change);
  }

  // Every dataset that opens, outdated ones left out.
  async function openDatasets() {
    return (await registry.list())
      .filter((d) => !d.outdated)
      .flatMap((d) => {
        const db = tryOpen(d.slug);
        return db === null ? [] : [db];
      });
  }

  function tryOpen(slug: string): Database | null {
    try {
      return registry.open(slug);
    } catch {
      return null;
    }
  }

  function handlersOf(db: Database) {
    let handlers = handlersByDb.get(db);
    if (handlers === undefined) {
      handlers = createDatasetHandlers(db, scans.forDataset(db));
      handlersByDb.set(db, handlers);
    }
    return handlers;
  }

  function getHandlers(slug: string): DatasetHandlers | null {
    const db = tryOpen(slug);
    return db === null ? null : handlersOf(db);
  }

  return {
    async routeApi(req, pathname) {
      const lifecycle = await routeLifecycle(req, pathname);
      if (lifecycle !== null) return lifecycle;
      const shared = await scans.route(req, pathname);
      if (shared !== null) return shared;
      const m = DATASET_RE.exec(pathname);
      if (m === null) return null;
      const slug = m.groups!.slug!;
      const rest = m.groups!.rest ?? '/';
      const handlers = getHandlers(slug);
      if (handlers === null) {
        return new Response('dataset not found', { status: 404 });
      }
      return await routeDataset(req, handlers, rest, registry.mediaDir(slug));
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
    // index.html links its assets relatively, so the page at /d/<slug> asks
    // for them one level up, as /d/<asset>.
    else if (path.startsWith('/d/')) path = path.slice('/d'.length);
    if (path === '/') path = '/index.html';
    for (const root of config.staticRoots) {
      const file = Bun.file(`${root}${path}`);
      if (file.size > 0) return new Response(file);
    }
    return new Response('Not Found', { status: 404 });
  };
}
