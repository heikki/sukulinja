import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BrowserWindow } from 'electrobun/bun';

import { DatasetRegistry } from './dataset-registry';
import { createApi, createStaticFetch } from './server';

const resourcesDir = resolve(dirname(process.argv0), '..', 'Resources');
const viewsDir = join(resourcesDir, 'app', 'views', 'app');

// In a dev build the .app lives inside <projectRoot>/build/dev-<arch>/...,
// so we can walk back up to find the source-side data folder.
function findProjectRoot(): string | null {
  const root = resolve(resourcesDir, '..', '..', '..', '..', '..');
  return existsSync(join(root, 'src', 'server')) ? root : null;
}

const projectRoot = findProjectRoot();
if (projectRoot === null) {
  throw new Error('Could not locate project root from .app location');
}

const registry = new DatasetRegistry(join(projectRoot, 'data'));
const api = createApi(registry);
const fetch = createStaticFetch({ api, staticRoots: [viewsDir] });
const server = Bun.serve({ port: 0, fetch });

void new BrowserWindow({
  title: 'Sukulinja',
  url: server.url.toString(),
  frame: { x: 100, y: 100, width: 1200, height: 800 }
});
