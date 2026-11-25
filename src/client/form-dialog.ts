import { css, html } from 'lit';
import type { TemplateResult } from 'lit';
import { ref } from 'lit/directives/ref.js';

// Dialogs a press started on their backdrop: only a press both started
// and ended there closes one, so a drag out of a field doesn't.
const pressedOutside = new WeakSet<Element>();

// Shown as a modal once drawn and on the page: over everything, in the top
// layer, the rest of the window inert under it.
function showModal(el: Element | undefined) {
  if (!(el instanceof HTMLDialogElement)) return;
  queueMicrotask(() => {
    if (el.isConnected && !el.open) el.showModal();
  });
}

// A form in a modal: a scrim over the window and a card on it, titled,
// its fields, then its buttons, as New dataset's. A press on the scrim
// asks to `close`, as Cancel and Esc do; presses on the card stay there.
// `keydown` hears the card's keys.
export function formDialog(form: {
  title: string;
  close: () => void;
  keydown: (e: KeyboardEvent) => void;
  fields: unknown;
  actions: unknown;
}): TemplateResult {
  return html`<dialog
    class="dialog"
    aria-labelledby="form-title"
    ${ref(showModal)}
    @keydown=${form.keydown}
    @cancel=${(e: Event) => {
      e.preventDefault();
      form.close();
    }}
    @mousedown=${(e: MouseEvent) => {
      const dialog = e.currentTarget as Element;
      if (e.target === dialog) pressedOutside.add(dialog);
      else pressedOutside.delete(dialog);
    }}
    @click=${(e: MouseEvent) => {
      const dialog = e.currentTarget as Element;
      if (e.target === dialog && pressedOutside.has(dialog)) form.close();
    }}
  >
    <div class="card">
      <h2 id="form-title">${form.title}</h2>
      <div class="form">${form.fields}</div>
      <div class="actions">${form.actions}</div>
    </div>
  </dialog>`;
}

// The form's own look, after `formStyles` and `dialogStyles`: its fields on
// the card itself, spaced out, a note among them muted, a refusal red, and
// the buttons a little below. An Entry's panel on the scan is laid out to
// match (scan-viewer/entry-form.ts).
export const formDialogStyles = css`
  :host {
    display: contents;
  }

  /* Roomier than a modal that only asks: a form has room to breathe. The
     card's padding is inside the dialog, so a press on it is never a
     press on the backdrop. */
  dialog.dialog {
    max-width: min(26rem, calc(100vw - 2rem));
    margin: auto;
    padding: 0;
    color: var(--fg);
    cursor: auto;
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  .card {
    padding: 1.1rem 1.25rem;
  }

  .dialog .form {
    gap: 0.6rem;
    margin-top: 0.5rem;
    border: 0;
    padding: 0;
    background: none;
  }

  .dialog label {
    grid-template-columns: 6.5rem 1fr;
    gap: 0.75rem;
  }

  .dialog input,
  .dialog select {
    padding: 0.35rem 0.5rem;
  }

  /* Room kept for the chevron (selectStyles). */
  .dialog select {
    padding-right: 1.6rem;
  }

  .dialog .form p {
    margin: 0.5rem 0 0.1rem;
    color: var(--muted);
  }

  .dialog .actions {
    margin-top: 1.2rem;
  }

  .dialog .form p.error {
    margin: 0;
    color: var(--danger);
  }
`;
