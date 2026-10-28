import { randomBytes, timingSafeEqual } from 'node:crypto';

import { sameOriginPath } from './last-view';

// The app's server answers its own window and nothing else: not a browser
// on this Mac, not another machine. Each launch makes a fresh key; the window
// opens on enterUrl, which trades the key for a cookie and moves on to the
// page it was opened for, so the key never sits in a URL the page can hand on.

const ENTER_PATH = '/enter';
const COOKIE = 'sukulinja-window';

export function newWindowKey() {
  return randomBytes(32).toString('base64url');
}

// `view` is the path the window lands on, hash and all.
export function enterUrl(base: URL, key: string, view = '/') {
  const url = new URL(ENTER_PATH, base);
  url.searchParams.set('key', key);
  url.searchParams.set('next', view);
  return url.toString();
}

function matches(given: string | null, key: string) {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieOf(req: Request) {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return null;
}

function forbidden() {
  return new Response(null, { status: 403 });
}

export function windowOnly(
  key: string,
  fetch: (req: Request) => Promise<Response>
) {
  return async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === ENTER_PATH) {
      if (!matches(url.searchParams.get('key'), key)) return forbidden();
      return new Response(null, {
        status: 303,
        headers: {
          'Location':
            sameOriginPath(url.searchParams.get('next') ?? '/', url) ?? '/',
          'Set-Cookie': `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Strict`
        }
      });
    }
    if (!matches(cookieOf(req), key)) return forbidden();
    return await fetch(req);
  };
}
