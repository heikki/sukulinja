import { assistantOn } from '@/client/assistant-flag';
import type { AppApi } from '@/client/dataset-api/app';
import type {
  AssistantKeyStatus,
  OffloadFolder,
  StorageStatus
} from '@/common/types';

// What Settings' rows last heard from the app, kept past the popover
// closing, so each opening draws them as they last stood, at their full
// size, while the rows ask again behind. Unset until first heard.
export interface Known {
  storage?: StorageStatus;
  folder?: OffloadFolder | null;
  key?: AssistantKeyStatus;
}

const known = new WeakMap<AppApi, Known>();

export function knownOf(app: AppApi): Known {
  let k = known.get(app);
  if (k === undefined) {
    k = {};
    known.set(app, k);
  }
  return k;
}

// An answer heard ahead, if the app gives one; a refusal is left for the
// row to show when it asks.
function keep<T>(asked: Promise<T>, set: (value: T) => void) {
  void asked.then(set).catch(() => undefined);
}

// Asks for Settings' rows as the page opens, so even the popover's first
// opening has them to show. The key only while the Assistant is on, as
// its row is drawn only then. An answer heard first from a row stands.
export function preloadSettings(app: AppApi) {
  const k = knownOf(app);
  keep(app.storage(), (s) => {
    k.storage ??= s;
  });
  keep(app.offloadFolder(), (f) => {
    if (k.folder === undefined) k.folder = f;
  });
  if (assistantOn.get()) {
    keep(app.assistantKey(), (s) => {
      k.key ??= s;
    });
  }
}
