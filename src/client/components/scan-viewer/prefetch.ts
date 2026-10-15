// Images beside the shown one, loaded into the webview's cache so stepping
// onto one shows it at once. One at a time and in the order asked, since
// the server's lane takes whichever request reaches it idle first; an
// aborted one is dropped there too.

type Load = (url: string, signal: AbortSignal) => Promise<unknown>;

async function load(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  await res.arrayBuffer();
}

interface Job {
  url: string;
  abort: AbortController;
}

export class Prefetch {
  private queue: string[] = [];
  private current: Job | null = null;
  private readonly fetched = new Set<string>();

  constructor(private readonly loader: Load = load) {}

  // These, in order, after the one on its way if it is among them.
  want(urls: string[]) {
    this.keep(urls);
    this.queue = urls.filter(
      (url) => !this.fetched.has(url) && url !== this.current?.url
    );
    this.pump();
  }

  // Aborts the one on its way unless it is among these, and starts no more.
  keep(urls: string[]) {
    this.queue = [];
    if (this.current !== null && !urls.includes(this.current.url)) {
      this.current.abort.abort();
      this.current = null;
    }
  }

  private pump() {
    const url = this.current === null ? this.queue.shift() : undefined;
    if (url === undefined) return;
    const job: Job = { url, abort: new AbortController() };
    this.current = job;
    void this.loader(url, job.abort.signal)
      .then(() => this.fetched.add(url))
      .catch(() => undefined)
      .finally(() => {
        if (this.current !== job) return;
        this.current = null;
        this.pump();
      });
  }
}
