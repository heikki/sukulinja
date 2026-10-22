// The chooser's dialogs: a failure note, and the dataset actions asked to
// confirm first, deleting a dataset and undoing its last import.

import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';

import { ApiError } from '@/client/dataset-api';
import type { LifecycleApi } from '@/client/dataset-api/lifecycle';
import type { DatasetInfo } from '@/common/types';

import { importDate } from './import-review';

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

export type DatasetAction = 'delete' | 'undo';

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
      <strong>${d.displayName}</strong> (${d.personCount} people) will be
      permanently removed. This can't be undone.
    `,
    label: 'Delete',
    busy: 'Deleting…',
    failed: 'Delete failed',
    run: async (api, d) => {
      await api.remove(d.slug);
    }
  },
  undo: {
    title: 'Undo last import?',
    body: (d) => html`
      <strong>${d.displayName}</strong> goes back to how it was before it was
      imported on ${importDate(d.importedAt)}. Anything changed since is lost.
    `,
    label: 'Undo import',
    busy: 'Undoing…',
    failed: 'Undo failed',
    run: async (api, d) => {
      await api.undoImport(d.slug);
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
  return html`
    <div class="overlay" @click=${on.cancel}>
      <div
        class="dialog"
        role="alertdialog"
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        <h2>${copy.title}</h2>
        <p>${copy.body(c.dataset)}</p>
        ${errorNote(copy.failed, c.error)}
        <div class="actions">
          <button @click=${on.cancel} ?disabled=${c.busy}>Cancel</button>
          <button class="danger" @click=${on.confirm} ?disabled=${c.busy}>
            ${c.busy ? copy.busy : copy.label}
          </button>
        </div>
      </div>
    </div>
  `;
}
