import { css } from 'lit';

import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';

// The shared dialog, wider, its list scrolling between the heading and the
// buttons. The card is what a Reminder's menu is placed in.
const list = css`
  dialog {
    width: 100%;
    max-width: 34rem;
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
    position: relative;
    display: flex;
    flex-direction: column;
    max-width: none;
    max-height: min(36rem, calc(100vh - 4rem));
    margin: 0;
  }

  ul {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -0.75rem 1rem;
    padding: 0;
    list-style: none;
  }

  .dialog button.row {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    text-align: left;
  }

  .dialog button.row:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .dialog button.row.stale {
    cursor: default;
  }

  .dialog button.row.done {
    opacity: 0.55;
  }

  .text {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .on {
    color: var(--muted);
    font-size: 0.85em;
  }

  .chip {
    margin-left: 0.4rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    font-size: 0.9em;
  }

  .dialog p.muted {
    color: var(--muted);
  }

  .dialog p.error {
    margin: 0 0.75rem 0.3rem;
    color: var(--danger);
  }

  .actions {
    align-items: center;
  }

  /* Shows or hides the done ones, at the start of the buttons' row. */
  .dialog button.show-done {
    margin-right: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 0.85rem;
  }

  .dialog button.show-done:hover {
    text-decoration: underline;
  }
`;

export const remindersDialogStyles = [focusRingStyles, dialogStyles, list];
