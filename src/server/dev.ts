import indexHtml from '../client/index.html';
import { createApi, createStaticFetch } from './server';

const api = createApi();
const fetch = createStaticFetch({ api, staticRoots: ['src/client'] });

const server = Bun.serve({
  port: 0,
  routes: { '/': indexHtml },
  development: false,
  fetch
});

console.log(`sukulinja dev → ${server.url.toString()}`);
