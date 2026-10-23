import { css } from 'lit';

import { dialogStyles } from '@/client/dialog-styles';
import { floatingStyles } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';

// The shared dialog's card, floating, near square like a note, with its
// fields one above the other and its buttons at the bottom.
const fields = css`
  :host {
    --panel-width: 22rem;
  }

  .dialog {
    max-width: none;
    min-height: 15rem;
  }

  .dialog:popover-open {
    display: flex;
    flex-direction: column;
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

  /* What it's on, muted, in place of a heading, with the menu's button
     and closing in the corner. */
  .top {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
  }

  .header {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .tools {
    display: flex;
    gap: 0.25rem;
    margin: -0.5rem -0.75rem 0 0;
  }

  .dialog .tools button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .dialog .tools button:hover,
  .dialog .tools button[aria-expanded='true'] {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  .tools svg {
    width: 1rem;
    height: 1rem;
  }

  /* Read-only, as written. */
  .dialog p.text {
    margin: 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  p.error {
    color: var(--danger);
  }

  .actions {
    margin-top: auto;
  }
`;

export const reminderDialogStyles = [
  focusRingStyles,
  dialogStyles,
  floatingStyles,
  fields
];
