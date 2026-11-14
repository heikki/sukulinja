import type { ReactiveController, ReactiveControllerHost } from 'lit';

import { ApiError } from '@/client/dataset-api';

// A component asking the app: one ask at a time (`busy`), and why the
// last was refused (`refused`), in the app's words. Anything else thrown
// is a bug, and is thrown on.
export class Asking implements ReactiveController {
  private running = false;
  private words: string | null = null;

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  get busy() {
    return this.running;
  }

  get refused() {
    return this.words;
  }

  // A refusal goes with the host: shown again, it starts afresh.
  hostDisconnected() {
    this.words = null;
  }

  // Runs `ask` unless one is running: true once it's done, false when it's
  // refused or another was running.
  async run(ask: () => Promise<unknown>) {
    if (this.running) return false;
    this.running = true;
    this.words = null;
    this.host.requestUpdate();
    try {
      await ask();
      return true;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.words = err.message;
      return false;
    } finally {
      this.running = false;
      this.host.requestUpdate();
    }
  }

  // Forgets why the last ask was refused.
  forget() {
    if (this.words === null) return;
    this.words = null;
    this.host.requestUpdate();
  }
}
