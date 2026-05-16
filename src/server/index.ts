import { BrowserWindow } from 'electrobun/bun';

import { createServer } from './server';

const server = createServer();

void new BrowserWindow({
  title: 'Sukulinjat',
  url: server.url.toString(),
  frame: { x: 100, y: 100, width: 1200, height: 800 }
});
