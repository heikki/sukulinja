import { resolve } from 'node:path';

import { serveInBrowser } from './browser';
import { seedDemo } from './datasets/demo';
import { DatasetRegistry } from './datasets/registry';

// The checkout's data/, unless SUKULINJA_DATA names another folder (e.g. a
// copy of the installed app's ~/Library/Application Support/Sukulinja/data,
// which drifts from this one).
const registry = new DatasetRegistry(
  resolve(process.env.SUKULINJA_DATA ?? 'data')
);
await seedDemo(registry, resolve('resources/demo/bourbon.gdz'));
void registry.sweepStaging(); // clear staging dirs left by interrupted imports
const server = serveInBrowser(registry, { warmUp: true, hmr: true });

console.log(`sukulinja dev → ${server.url.toString()}`);
