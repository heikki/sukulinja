import { createServer } from './server';

const server = createServer();

console.log(`sukulinjat dev → ${server.url.toString()}`);
