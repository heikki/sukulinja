import { ApiError } from '@client/dataset-api';

// One request at a time: asking again aborts the last one.
export class Latest {
  private abort: AbortController | null = null;

  // The answer; null when it failed, undefined when a later ask took over.
  async run<T>(ask: (signal: AbortSignal) => Promise<T>) {
    this.stop();
    const abort = new AbortController();
    this.abort = abort;
    try {
      return await ask(abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return undefined;
      if (err instanceof ApiError) return null;
      throw err;
    }
  }

  stop() {
    this.abort?.abort();
  }
}
