// How much more the Scan cache may take before it has to be listed again,
// so that a fetch needn't list all of it to see that it still fits. What's
// removed isn't counted: that only makes the next listing come early. What
// arrives other than by a fetch has to `forget` what was measured.

export function openCacheRoom() {
  let room: number | null = null;
  let written = 0;
  let measuredAt = 0;
  let forgotten = 0;
  return {
    wrote(bytes: number) {
      written += bytes;
    },
    outgrown() {
      return room === null || written - measuredAt > room;
    },
    forget() {
      room = null;
      forgotten += 1;
    },
    // To call before listing; what it returns takes the room found. What's
    // written during the listing counts against it, even if listed too.
    measuring() {
      const at = written;
      const since = forgotten;
      return (found: number) => {
        if (since !== forgotten) return;
        measuredAt = at;
        room = found;
      };
    }
  };
}
