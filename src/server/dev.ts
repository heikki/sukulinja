import { createServer } from './server';

const server = createServer();

console.log(`sukulinja dev → ${server.url.toString()}`);
