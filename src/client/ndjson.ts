// Read a newline-delimited JSON stream, each event as its line completes.
// Events arrive parsed but unchecked; callers know their shape. Stopping
// early cancels the stream.
export async function* readNdjson(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  try {
    while (!done) {
      // eslint-disable-next-line no-await-in-loop -- the stream is read sequentially, one chunk at a time
      const chunk = await reader.read();
      done = chunk.done;
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
        stream: !done
      });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line !== '') yield JSON.parse(line) as unknown;
        nl = buffer.indexOf('\n');
      }
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
  }
}
