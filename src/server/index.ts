import { dirname, join, resolve } from 'node:path';
import { BrowserWindow } from 'electrobun/bun';

import { createApi, createStaticFetch } from './server';

const resourcesDir = resolve(dirname(process.argv0), '..', 'Resources');
const viewsDir = join(resourcesDir, 'app', 'views', 'app');

const api = createApi();
const fetch = createStaticFetch({ api, staticRoots: [viewsDir] });
const server = Bun.serve({ port: 0, fetch });

void new BrowserWindow({
  title: 'Sukulinja',
  url: server.url.toString(),
  frame: { x: 100, y: 100, width: 1200, height: 800 }
});
