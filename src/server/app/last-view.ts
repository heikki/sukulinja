// The app reopens where it was left. The page puts its URL here a moment
// after each move, and the next launch opens the window on it.

const LAST_VIEW_PATH = '/last-view';
export const DATASET_PATH_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?=\/|$)/u;

// A path on this server, with its query and hash; null for anything else.
export function sameOriginPath(given: string, base: URL) {
  try {
    const url = new URL(given, base);
    return url.origin === base.origin
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}

export function lastViewRoute(
  save: (view: string) => void,
  fetch: (req: Request) => Promise<Response>
) {
  return async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname !== LAST_VIEW_PATH) return await fetch(req);
    if (req.method !== 'PUT') return new Response(null, { status: 405 });
    const view = sameOriginPath(await req.text(), url);
    if (view === null) return new Response(null, { status: 400 });
    save(view);
    return new Response(null, { status: 204 });
  };
}

// Where a launch opens: the saved view, or the chooser when none is saved.
// Null when the view's dataset was deleted, renamed or built by an older
// schema: the chooser opens, and the view is dropped.
export function reopenAt(
  view: string | null,
  isCurrent: (slug: string) => boolean
) {
  if (view === null) return '/';
  const slug = DATASET_PATH_RE.exec(view)?.groups?.slug;
  return slug === undefined || isCurrent(slug) ? view : null;
}
