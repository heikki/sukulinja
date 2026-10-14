// Read a newline-delimited JSON stream, handing each event over as its line
// completes. Events arrive parsed but unchecked; callers know their shape.
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: unknown) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- the stream is read sequentially, one chunk at a time
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
      stream: !chunk.done
    });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line !== '') onEvent(JSON.parse(line));
      nl = buffer.indexOf('\n');
    }
    if (chunk.done) break;
  }
}
