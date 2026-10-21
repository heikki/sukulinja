// The chooser's dialogs: a failure note, and the dataset actions asked to
// confirm first, deleting a dataset and undoing its last import.

import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';

import type { DatasetInfo } from '@common/types';

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
  request: (d: DatasetInfo) => { url: string; method: string };
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
    request: (d) => ({ url: `/datasets/${d.slug}`, method: 'DELETE' })
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
    request: (d) => ({ url: `/datasets/${d.slug}/undo-import`, method: 'POST' })
  }
};

export interface Confirming {
  action: DatasetAction;
  dataset: DatasetInfo;
  busy: boolean;
  error: string | null;
}

// Runs a confirmed action; why it failed, or null.
export async function runAction(c: Confirming) {
  const { url, method } = ACTIONS[c.action].request(c.dataset);
  try {
    const res = await fetch(url, { method });
    if (res.ok) return null;
    const msg = await res.text();
    return msg === '' ? `${c.action} failed (${res.status})` : msg;
  } catch (err) {
    return err instanceof Error ? err.message : `${c.action} failed`;
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
