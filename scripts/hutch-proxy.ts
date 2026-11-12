// A local proxy for Hutch (Electrobun's toolchain) in cloud sessions. Hutch
// can't open a tunnel through the session's HTTPS proxy, and falls back to
// asking for each https download as plain http; this fetches it over https,
// through the session's proxy, and hands it back. Run by session-start.sh.

const port = Number(process.argv[2] ?? 18080);

Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(req) {
    // A tunnel can't be opened here, so Hutch falls back to plain requests.
    if (req.method === 'CONNECT') return new Response(null, { status: 405 });
    const res = await fetch(req.url.replace(/^http:/u, 'https:'), {
      method: req.method,
      headers: req.headers,
      redirect: 'manual'
    });
    // fetch has decoded the body, so its old encoding and length don't fit.
    const headers = new Headers(res.headers);
    for (const h of [
      'content-encoding',
      'content-length',
      'transfer-encoding'
    ]) {
      headers.delete(h);
    }
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers
    });
  }
});
