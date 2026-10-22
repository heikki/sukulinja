// The app reopens where it was left (src/server/last-view.ts): the page puts
// its URL to the server once it has stayed there a moment.

const SETTLE_MS = 1000;

let timer: ReturnType<typeof setTimeout> | null = null;

export function reportView() {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    // A view that fails to save only reopens an older one.
    fetch('/last-view', {
      method: 'PUT',
      body: location.pathname + location.search + location.hash
    }).catch(() => undefined);
  }, SETTLE_MS);
}
