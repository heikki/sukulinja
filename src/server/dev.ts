import { resolve } from 'node:path';

import indexHtml from '../client/index.html';
import { DatasetRegistry } from './dataset-registry';
import { createApi, createStaticFetch } from './server';

const registry = new DatasetRegistry(resolve('data'));
const api = createApi(registry);
const fetch = createStaticFetch({ api, staticRoots: ['src/client'] });

const server = Bun.serve({
  port: 0,
  routes: {
    '/': indexHtml,
    '/d/:slug/api/*': false,
    '/d/:slug/media/*': false,
    '/d/:slug': indexHtml,
    '/d/:slug/*': indexHtml
  },
  development: { hmr: true, console: true },
  fetch
});

console.log(`sukulinja dev → ${server.url.toString()}`);
