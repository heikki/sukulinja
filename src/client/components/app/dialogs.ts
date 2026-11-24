// The chooser's dialogs: a failure note, and the dataset actions asked to
// confirm first (sl-ask): deleting a dataset.

import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';

import { ApiError } from '@/client/dataset-api';
import type { LifecycleApi } from '@/client/dataset-api/lifecycle';
import type { DatasetInfo } from '@/common/types';

import '../ask';

import type { Ask } from '../ask';

// A dialog's failure: what failed, then the server's message, which can be a
// long raw path or stack line — hence wrapped anywhere and scrollable.
export function errorNote(title: string, message: string | null) {
  if (message === null) return nothing;
  return html`
    <div class="error" role="alert">
      <strong>${title}</strong>
      <span class="message">${message}</span>
    </div>
  `;
}

export type DatasetAction = 'delete';

interface ActionCopy {
  title: string;
  body: (d: DatasetInfo) => TemplateResult;
  label: string;
  busy: string;
  failed: string;
  run: (api: LifecycleApi, d: DatasetInfo) => Promise<void>;
}

const ACTIONS: Record<DatasetAction, ActionCopy> = {
  delete: {
    title: 'Delete dataset?',
    body: (d) => html`
      <strong>${d.displayName}</strong>
      (${d.personCount === 1 ? '1 person' : `${d.personCount} people`}) will be
      permanently removed. This can't be undone.
    `,
    label: 'Delete',
    busy: 'Deleting…',
    failed: 'Delete failed',
    run: async (api, d) => {
      await api.remove(d.slug);
    }
  }
};

export interface Confirming {
  action: DatasetAction;
  dataset: DatasetInfo;
  busy: boolean;
  error: string | null;
}

// Runs a confirmed action; why it failed, or null.
export async function runAction(api: LifecycleApi, c: Confirming) {
  try {
    await ACTIONS[c.action].run(api, c.dataset);
    return null;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return err.message;
  }
}

export function confirmDialog(
  c: Confirming,
  on: { cancel: () => void; confirm: () => void }
) {
  const copy = ACTIONS[c.action];
  const ask: Ask = {
    title: copy.title,
    text: copy.body(c.dataset),
    step: copy.label,
    tone: 'danger'
  };
  return html`<sl-ask
    .ask=${ask}
    .busy=${c.busy ? copy.busy : null}
    .refused=${c.error === null ? null : `${copy.failed}: ${c.error}`}
    @cancel=${on.cancel}
    @confirm=${on.confirm}
  ></sl-ask>`;
}
