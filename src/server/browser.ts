import indexHtml from '../client/index.html';
import { lastViewRoute } from './app/last-view';
import type { DatasetRegistry } from './datasets/registry';
import { createApi, createStaticFetch } from './server';
import type { ApiOptions } from './server';

// The app served to a browser tab, as `bun dev` and the e2e tests open it:
// the page bundled by Bun from src/client, the API on the registry's
// datasets, on a free port of this machine.
export function serveInBrowser(
  registry: DatasetRegistry,
  { hmr = false, ...options }: ApiOptions & { hmr?: boolean } = {}
) {
  const api = createApi(registry, options);
  // A browser tab keeps its own URL, so the page's last view is dropped.
  const fetch = lastViewRoute(
    () => undefined,
    createStaticFetch({ api, staticRoots: ['src/client'] })
  );
  return Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    // Imports stream progress across slow photo downloads; keep the
    // connection alive through quiet stretches (default idleTimeout is only
    // 10s).
    idleTimeout: 255,
    routes: {
      '/': indexHtml,
      '/d/:slug/api/*': false,
      '/d/:slug/media/*': false,
      '/d/:slug/thumbs/*': false,
      '/d/:slug': indexHtml,
      '/d/:slug/*': indexHtml
    },
    development: { hmr, console: hmr },
    fetch
  });
}
