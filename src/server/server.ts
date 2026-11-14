import type { Database } from 'bun:sqlite';
import { relative, resolve } from 'node:path';

import { assistantOperations } from './assistant/asking';
import type { AssistantDeps } from './assistant/asking';
import { claude } from './assistant/model';
import type { Changes, NewChange } from './changes/changes';
import { changeOperations } from './changes/operations';
import { openCitations } from './citations';
import type { Astia } from './citations';
import { systemKeyStore } from './claude/key';
import type { KeyStore } from './claude/key';
import { routeAssistantKey } from './claude/key-routes';
import { lifecycleRoutes } from './datasets/lifecycle-routes';
import { mediaDirOf } from './datasets/registry';
import type { DatasetRegistry } from './datasets/registry';
import { openServices } from './datasets/services';
import type { DatasetServices } from './datasets/services';
import { factOperations } from './facts/operations';
import { serveOperations } from './operations';
import { treeOperations } from './persons/operations';
import { photoOperations, routeAddPhoto } from './photos';
import { reminderOperations } from './reminders/operations';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?<rest>\/.*)?$/u;

interface ApiHandlers {
  routeApi: (req: Request, pathname: string) => Promise<Response | null>;
}

interface DatasetHandlers {
  // The dataset's Changes, which the rest of the app writes into.
  changes: Changes;
  // The dataset's routes under /d/<slug>; null for any other path.
  route: (req: Request, rest: string) => Promise<Response | null>;
}

// A file of the dataset's media folder.
async function serveMedia(mediaDir: string, rest: string) {
  const rel = decodeURIComponent(rest.slice('/media/'.length));
  const fullPath = resolve(mediaDir, rel);
  if (relative(mediaDir, fullPath).startsWith('..')) {
    return new Response('forbidden', { status: 403 });
  }
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return new Response('not found', { status: 404 });
  }
  return new Response(file);
}

function createDatasetHandlers(
  services: DatasetServices,
  mediaDir: string,
  assistant: AssistantDeps
): DatasetHandlers {
  const { reminders, changes, facts, photoFiles, scans } = services;
  const operations = serveOperations({
    ...treeOperations(services),
    ...factOperations(facts),
    ...scans.operations,
    ...photoOperations(services),
    ...reminderOperations(reminders),
    ...changeOperations(changes),
    ...assistantOperations(services, assistant)
  });
  return {
    changes,
    async route(req, rest) {
      if (rest.startsWith('/media/')) return await serveMedia(mediaDir, rest);
      return (
        (await routeAddPhoto(req, photoFiles, rest)) ??
        (await operations(req, rest))
      );
    }
  };
}

interface ApiOptions {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string;
  // Whether each dataset, once opened, asks Astia in the background for
  // what its references resolve against.
  warmUp?: boolean;
  // Where the assistant's API key is kept; by default the system's
  // credential store.
  keyStore?: KeyStore;
  // The assistant's model for a key; by default Claude.
  assistantModel?: AssistantDeps['model'];
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
  const keyStore = options.keyStore ?? systemKeyStore();
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
      .filter((d) => d.outdated === null)
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
      const mediaDir = mediaDirOf(db);
      handlers = createDatasetHandlers(
        openServices(db, scans.forDataset(db), mediaDir),
        mediaDir,
        { keyStore, model: options.assistantModel ?? claude }
      );
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
      const key = await routeAssistantKey(keyStore, req, pathname);
      if (key !== null) return key;
      const m = DATASET_RE.exec(pathname);
      if (m === null) return null;
      const slug = m.groups!.slug!;
      const rest = m.groups!.rest ?? '/';
      const handlers = getHandlers(slug);
      if (handlers === null) {
        return new Response('dataset not found', { status: 404 });
      }
      return await handlers.route(req, rest);
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
