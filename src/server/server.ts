import type { Database } from 'bun:sqlite';
import { resolve } from 'node:path';

import { APP_OPERATIONS, OPERATIONS } from '@/common/operations';
import type { DATASET_OPERATIONS } from '@/common/operations/datasets';

import { assistantOperations } from './assistant/asking';
import type { AssistantDeps } from './assistant/asking';
import { claude } from './assistant/model';
import type { RunOperation } from './assistant/proposal';
import { bookOperations } from './books';
import type { Changes, NewChange } from './changes/changes';
import { changeOperations } from './changes/operations';
import { claudeVision, openCitations } from './citations';
import type { Astia, DownloadOptions, VisionReaders } from './citations';
import { systemKeyStore } from './claude/key';
import type { KeyStore } from './claude/key';
import { keyOperations, keyStatus } from './claude/key-operations';
import { copyOperations } from './datasets/copy-operations';
import { lifecycleRoutes } from './datasets/lifecycle-routes';
import { mediaDirOf, slugOf } from './datasets/registry';
import type { DatasetRegistry } from './datasets/registry';
import { openServices } from './datasets/services';
import type { DatasetServices } from './datasets/services';
import { factOperations } from './facts/operations';
import { isInside } from './inside';
import { serveOperations } from './operations';
import type { Handler, Handlers } from './operations';
import { treeOperations } from './persons/operations';
import {
  FOREVER,
  photoOperations,
  routeAddPhoto,
  thumbnail,
  warmThumbnails
} from './photos';
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

// A file of the dataset's media folder, at `/media/<name>`, or its
// thumbnail, at `/thumbs/<name>`; cached for good, as each is named by
// its content, unless the thumbnail couldn't be made.
async function serveMedia(mediaDir: string, rest: string, thumb: boolean) {
  const prefix = thumb ? '/thumbs/' : '/media/';
  const rel = decodeURIComponent(rest.slice(prefix.length));
  const fullPath = resolve(mediaDir, rel);
  if (!isInside(mediaDir, fullPath)) {
    return new Response('forbidden', { status: 403 });
  }
  if (!(await Bun.file(fullPath).exists())) {
    return new Response('not found', { status: 404 });
  }
  const served = thumb ? await thumbnail(mediaDir, rel) : fullPath;
  // A thumbnail that couldn't be made, served whole, may be made later.
  const kept = !thumb || served !== fullPath;
  return new Response(Bun.file(served), {
    headers: { 'Cache-Control': kept ? FOREVER : 'no-cache' }
  });
}

function createDatasetHandlers(
  services: DatasetServices,
  mediaDir: string,
  assistant: AssistantDeps,
  copies: Handlers<typeof DATASET_OPERATIONS>
): DatasetHandlers {
  const { reminders, changes, facts, photoFiles, scans } = services;
  // The dataset's own operations, which the assistant's Proposals are
  // applied through too.
  const own = {
    ...treeOperations(services),
    ...factOperations(facts),
    ...scans.operations,
    ...bookOperations(services),
    ...photoOperations(services),
    ...reminderOperations(reminders),
    ...changeOperations(changes),
    ...copies
  };
  async function run(...[name, input]: Parameters<RunOperation>) {
    if (!Object.hasOwn(own, name)) throw new Error(`no operation ${name}`);
    const handler = own[name as keyof typeof own] as Handler<unknown>;
    return await handler(input as never, new AbortController().signal);
  }
  const operations = serveOperations(OPERATIONS, {
    ...own,
    ...assistantOperations(services, assistant, run)
  });
  return {
    changes,
    async route(req, rest) {
      if (rest.startsWith('/media/')) {
        return await serveMedia(mediaDir, rest, false);
      }
      if (rest.startsWith('/thumbs/')) {
        return await serveMedia(mediaDir, rest, true);
      }
      return (
        (await routeAddPhoto(req, photoFiles, rest)) ??
        (await operations(req, rest))
      );
    }
  };
}

export interface ApiOptions {
  // Astia's answers; by default over HTTP, kept in the data folder.
  astia?: Astia;
  // Where exports are saved; by default the user's Downloads.
  exportDir?: string;
  // Whether each dataset, once opened, asks Astia in the background for
  // what its references resolve against, and makes its Photos'
  // thumbnails that aren't made yet.
  warmUp?: boolean;
  // Where the assistant's API key is kept; by default the system's
  // credential store.
  keyStore?: KeyStore;
  // The assistant's model for a key; by default Claude.
  assistantModel?: AssistantDeps['model'];
  // The Scan viewer's vision model; by default Claude, with the
  // assistant's key.
  vision?: VisionReaders;
  // How church book downloads pace Astia; by default gently.
  downloads?: DownloadOptions;
  // The app's folder picker, for the offload folder; none in a browser.
  chooseFolder?: () => Promise<string | null>;
}

export function createApi(
  registry: DatasetRegistry,
  options: ApiOptions = {}
): ApiHandlers {
  const keyStore = options.keyStore ?? systemKeyStore();
  const scans = openCitations(registry.root, {
    astia: options.astia,
    warmUp: options.warmUp,
    downloads: options.downloads,
    chooseFolder: options.chooseFolder,
    datasets: async () => await openDatasets(),
    changed,
    vision:
      options.vision ??
      claudeVision(async () =>
        (await keyStatus(keyStore)).source === null
          ? null
          : { apiKey: await keyStore.get() }
      )
  });
  // Kept by the Database they're bound to: the registry alone decides when
  // a dataset's Database is closed and replaced (by an import or a delete),
  // and the next request then opens the new one and gets new handlers.
  const handlersByDb = new WeakMap<Database, DatasetHandlers>();
  // The operations shared by every dataset, at /api/<name>.
  const appOperations = serveOperations(APP_OPERATIONS, {
    ...scans.operations,
    ...keyOperations(keyStore)
  });
  const routeLifecycle = lifecycleRoutes(registry, {
    exportDir: options.exportDir,
    changed: changedIn
  });

  // Writes a Change into the dataset under the slug; not into one an older
  // version built, as undoing its first import since then puts back.
  function changedIn(slug: string, change: NewChange) {
    const db = tryOpen(slug);
    if (db !== null) changed(db, change);
  }

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
      const services = openServices(db, scans.forDataset(db), mediaDir);
      handlers = createDatasetHandlers(
        services,
        mediaDir,
        { keyStore, model: options.assistantModel ?? claude },
        copyOperations({
          registry,
          slug: slugOf(db),
          tree: services.tree,
          changed: changedIn
        })
      );
      if (options.warmUp === true) {
        const names = services.photos.all().map((p) => p.path);
        void warmThumbnails(mediaDir, names);
      }
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
      const shared =
        (await appOperations(req, pathname)) ??
        (await scans.route(req, pathname));
      if (shared !== null) return shared;
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
