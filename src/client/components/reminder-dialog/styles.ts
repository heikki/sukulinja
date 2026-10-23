import { css } from 'lit';

import { dialogStyles } from '@/client/dialog-styles';
import { floatingStyles } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';

// The shared dialog's card, floating, a little wider for a few lines of
// text, with its fields one above the other.
const fields = css`
  :host {
    --panel-width: 32rem;
  }

  .dialog {
    max-width: none;
  }

  label {
    display: block;
    margin: 0 0 0.3rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  select,
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 1rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.9rem;
  }

  textarea {
    min-height: 6rem;
    resize: vertical;
  }

  p.on {
    margin: 0 0 1rem;
  }

  /* What it's on, muted, in place of a heading. */
  .header {
    margin: 0 0 0.75rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  /* Read-only, as written. */
  .dialog p.text {
    margin: 0 0 1.25rem;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  p.error {
    color: var(--danger);
  }

  .actions {
    flex-wrap: wrap;
    align-items: center;
  }

  /* What else can be done to the Reminder, at the start of the buttons. */
  .more {
    display: flex;
    gap: 0.5rem;
    margin-right: auto;
  }
`;

export const reminderDialogStyles = [
  focusRingStyles,
  dialogStyles,
  floatingStyles,
  fields
];
