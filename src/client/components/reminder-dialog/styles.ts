import { css } from 'lit';

import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';

// The shared dialog, a little wider for a few lines of text, with its
// fields one above the other.
const fields = css`
  dialog {
    width: 100%;
    max-width: 28rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--fg);
    overflow: visible;
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  .dialog {
    max-width: none;
    margin: 0;
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

  p.error {
    color: var(--danger);
  }
`;

export const reminderDialogStyles = [focusRingStyles, dialogStyles, fields];
