import { resolve } from 'node:path';

import indexHtml from '../client/index.html';
import { DatasetRegistry } from './dataset-registry';
import { createApi, createStaticFetch } from './server';

const registry = new DatasetRegistry(resolve('data'));
void registry.sweepStaging(); // clear staging dirs left by interrupted imports
const api = createApi(registry);
const fetch = createStaticFetch({ api, staticRoots: ['src/client'] });

const server = Bun.serve({
  port: 0,
  // Imports stream progress across slow photo downloads; keep the connection
  // alive through quiet stretches (default idleTimeout is only 10s).
  idleTimeout: 255,
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
