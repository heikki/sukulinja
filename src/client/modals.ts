import type { ReactiveController, ReactiveControllerHost } from 'lit';

// Every modal up over the window, so a shortcut for what's under them, as
// ⌘F's search, waits until they're gone.
const up = new Set<Modal>();

export function modalUp() {
  return up.size > 0;
}

// Marks `host` a modal while `shown`, by default for as long as it's on the
// page.
export function markModal(
  host: ReactiveControllerHost,
  shown: () => boolean = () => true
) {
  host.addController(new Modal(shown));
}

class Modal implements ReactiveController {
  // An update can still land once the host is gone, as one waiting on a
  // load does: that mustn't put it back.
  private connected = false;

  constructor(private readonly shown: () => boolean) {}

  hostConnected() {
    this.connected = true;
    this.hostUpdated();
  }

  hostUpdated() {
    if (this.connected && this.shown()) up.add(this);
    else up.delete(this);
  }

  hostDisconnected() {
    this.connected = false;
    up.delete(this);
  }
}
