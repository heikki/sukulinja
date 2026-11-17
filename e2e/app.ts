// The app as an e2e test opens it: served to a headless Chromium from a
// data folder of its own, empty, with nothing reaching outside this
// machine. Astia answers from fixtureAstia, the assistant has no key, and
// exports go to the data folder.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { serveInBrowser } from '../src/server/browser';
import { memoryKeyStore } from '../src/server/claude/key';
import { DatasetRegistry } from '../src/server/datasets/registry';
import { fixtureAstia } from './astia';

export interface App {
  page: Page;
  // Where the app keeps its datasets, removed on close.
  dataDir: string;
  close: () => Promise<void>;
}

let launched: Promise<Browser> | null = null;

// One Chromium for the run, each app in a window of its own.
async function sharedBrowser() {
  launched ??= chromium.launch();
  return await launched;
}

export async function openApp(): Promise<App> {
  const dataDir = await mkdtemp(join(tmpdir(), 'sukulinja-e2e-'));
  const server = serveInBrowser(new DatasetRegistry(dataDir), {
    astia: await fixtureAstia(),
    keyStore: memoryKeyStore(),
    exportDir: dataDir
  });
  const context = await (
    await sharedBrowser()
  ).newContext({
    colorScheme: 'dark',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  // A step that waits longer than this has failed: nothing here is slow.
  page.setDefaultTimeout(5000);
  await page.goto(server.url.toString());
  return {
    page,
    dataDir,
    async close() {
      await context.close();
      await server.stop(true);
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

// A screenshot of the page as it is, for a person to look at, into the
// folder SUKULINJA_E2E_SHOTS names; none without it.
export async function shot(page: Page, name: string) {
  const dir = process.env.SUKULINJA_E2E_SHOTS;
  if (dir === undefined) return;
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

// Runs `steps` in an app of its own, closed after whatever happened.
export async function withApp(steps: (app: App) => Promise<void>) {
  const app = await openApp();
  try {
    await steps(app);
  } finally {
    await app.close();
  }
}

export async function closeBrowser() {
  const browser = launched;
  launched = null;
  await (await browser)?.close();
}
