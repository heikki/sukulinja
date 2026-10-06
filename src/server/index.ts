import { cpSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ApplicationMenu, BrowserWindow, Utils } from 'electrobun/main';

import { DatasetRegistry } from './dataset-registry';
import { createApi, createStaticFetch } from './server';
import { loadWindowFrame, saveWindowFrame } from './window-state';

const resourcesDir = resolve(dirname(process.argv0), '..', 'Resources');
const viewsDir = join(resourcesDir, 'app', 'views', 'app');

let isDev = false;
try {
  const versionInfo = (await Bun.file(
    join(resourcesDir, 'version.json')
  ).json()) as { channel?: string };
  isDev = versionInfo.channel === 'dev';
} catch {
  // ignore
}

// A dev build's .app lives inside <projectRoot>/build/dev-<arch>/..., so it
// walks back up and shares the checkout's data folder with `bun dev`. An
// installed app has no checkout to find and keeps its datasets in its own
// Application Support directory — named for the app, not Utils.paths.userData,
// which is <bundle id>/<channel> and shared with Electrobun's own files.
const supportDir = join(Utils.paths.appData, 'Sukulinja');
const dataDir = isDev
  ? join(resolve(resourcesDir, '..', '..', '..', '..', '..'), 'data')
  : join(supportDir, 'data');
// state.json sits beside the installed app's data folder. A dev build keeps
// its own inside the checkout's data folder, which is gitignored and where the
// registry only looks at directories.
const stateDir = isDev ? dataDir : supportDir;

// An installed app's first launch gets the bundled demo, so it has something
// to show. Keyed on the data folder not existing rather than on it being
// empty: deleting the demo later must not bring it back.
function seedDemo() {
  if (isDev || existsSync(dataDir)) return;
  cpSync(join(resourcesDir, 'app', 'demo'), dataDir, { recursive: true });
}
seedDemo();

const registry = new DatasetRegistry(dataDir);
void registry.sweepStaging(); // clear staging dirs left by interrupted imports
const api = createApi(registry);
const fetch = createStaticFetch({ api, staticRoots: [viewsDir] });
// A GEDCOM import streams progress while photos download; bump the idle timeout
// to its max so a quiet stretch between downloads doesn't drop the connection.
const server = Bun.serve({ port: 0, idleTimeout: 255, fetch });

ApplicationMenu.setApplicationMenu([
  {
    label: 'Sukulinja',
    submenu: [
      { role: 'hide', accelerator: 'CmdOrCtrl+H' },
      { role: 'hideOthers', accelerator: 'Alt+CmdOrCtrl+H' },
      { role: 'showAll' },
      { type: 'divider' },
      {
        label: 'Quit Sukulinja',
        action: 'quit',
        accelerator: 'CmdOrCtrl+Q'
      }
    ]
  },
  // Not decoration. On macOS the text-editing shortcuts are key equivalents
  // dispatched through the application menu, so without these items Cmd+A,
  // Cmd+C and friends never reach the webview's field editor at all. The
  // roles map to NSResponder selectors and act on the first responder.
  // Electrobun assigns no default accelerators, hence each one spelled out.
  {
    label: 'Edit',
    submenu: [
      { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
      { role: 'redo', accelerator: 'Shift+CmdOrCtrl+Z' },
      { type: 'divider' },
      { role: 'cut', accelerator: 'CmdOrCtrl+X' },
      { role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { role: 'paste', accelerator: 'CmdOrCtrl+V' },
      { type: 'divider' },
      { role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize', accelerator: 'CmdOrCtrl+M' },
      { role: 'close', accelerator: 'CmdOrCtrl+W' }
    ]
  }
]);

interface ElectrobunEvent {
  data?: { action?: string };
}

// Electrobun delivers the action under `event.data`, not the standard
// CustomEvent `event.detail` shape.
ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
  const action = (event as ElectrobunEvent).data?.action ?? '';
  if (action === 'quit') process.exit(0);
});

const savedFrame = loadWindowFrame(stateDir);
const win = new BrowserWindow({
  title: 'Sukulinja',
  url: server.url.toString(),
  frame: savedFrame ?? { x: 100, y: 100, width: 1200, height: 800 }
});
// The constructor reads `frame` as the content area and adds the title bar on
// top, while getFrame — what gets saved — reports the whole window. setFrame
// takes the whole window too, so without this the window would come back a
// title bar taller on every launch.
if (savedFrame !== null) {
  win.setFrame(savedFrame.x, savedFrame.y, savedFrame.width, savedFrame.height);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveWindowFrame(stateDir, win.getFrame());
  }, 500);
}

win.on('move', debouncedSave);
win.on('resize', debouncedSave);
