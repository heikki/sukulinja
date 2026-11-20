// Preloaded into every `bun test` run (bunfig.toml): a request past this
// machine fails the test that makes it. Tests answer for Astia and Claude
// themselves, and where the network is open (CI, a cloud session that may
// reach Astia) a test that reached out would otherwise still pass.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

const realFetch = globalThis.fetch;

function urlOf(input: string | URL | Request) {
  return new URL(input instanceof Request ? input.url : input);
}

async function localFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const url = urlOf(input);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `A test reached past this machine: ${url.origin}. Give it a fake instead.`
    );
  }
  return await realFetch(input, init);
}

globalThis.fetch = Object.assign(localFetch, {
  preconnect: realFetch.preconnect
});
