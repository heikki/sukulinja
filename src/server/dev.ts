import { resolve } from 'node:path';

import indexHtml from '../client/index.html';
import { createApi, createStaticFetch } from './server';

const api = createApi({
  dbPath: resolve('data', 'app.db'),
  // TODO: media root is hardcoded to a sibling MyHeritage export dir.
  mediaRoot: resolve('..', 'myheritage-export', 'media')
});
const fetch = createStaticFetch({ api, staticRoots: ['src/client'] });

const server = Bun.serve({
  port: 0,
  routes: { '/': indexHtml },
  development: false,
  fetch
});

console.log(`sukulinja dev → ${server.url.toString()}`);
