import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, PATHS } from 'electrobun/bun';

import { createServer } from './server';

const server = createServer();
const apiBase = server.url.toString().replace(/\/$/, '');

writeFileSync(
  join(PATHS.VIEWS_FOLDER, 'app', 'runtime-config.js'),
  `window.__SUKULINJA_API__ = ${JSON.stringify(apiBase)};\n`
);

void new BrowserWindow({
  title: 'Sukulinja',
  url: 'views://app/index.html',
  frame: { x: 100, y: 100, width: 1200, height: 800 }
});
