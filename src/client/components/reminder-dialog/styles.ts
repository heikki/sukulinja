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
    padding: 1rem;
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

  /* Growing into the note's height, down to its buttons. */
  textarea {
    flex: 1;
    min-height: 6rem;
    margin-bottom: 0.75rem;
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

  .header > div {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A line going to what it names, brightening under the pointer; only as
     wide as its text, so the rest of the row drags. */
  .dialog .header button.go {
    display: inline-block;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    color: inherit;
    font-size: inherit;
    text-align: left;
    vertical-align: top;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog .header button.go:hover {
    color: var(--fg);
  }

  /* The person a new one is on, ticked off to put it on the Image; only
     as wide as the box and name, so the rest of the row drags. */
  .who {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: inherit;
    cursor: pointer;
  }

  .who input {
    margin: 0;
    accent-color: var(--muted);
    cursor: pointer;
  }

  .tools {
    display: flex;
    gap: 0.25rem;
    margin: -0.25rem -0.25rem 0 0;
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
    font-size: 0.9rem;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  p.error {
    color: var(--danger);
  }

  /* Cancel and Save, small and light at the bottom right, so the note
     stays the main thing. */
  .actions {
    margin-top: auto;
    gap: 0.25rem;
  }

  .dialog .actions button {
    padding: 0.25rem 0.7rem;
    border-color: transparent;
    background: none;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .dialog .actions button:hover:not(:disabled) {
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  /* Save in the accent, filled only under the pointer. */
  .dialog .actions button.primary {
    color: var(--accent);
  }

  .dialog .actions button.primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--on-accent);
  }
`;

export const reminderDialogStyles = [
  focusRingStyles,
  dialogStyles,
  floatingStyles,
  fields
];
