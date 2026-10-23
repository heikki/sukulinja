import { css } from 'lit';

import { dialogStyles } from '@/client/dialog-styles';
import { floatingStyles } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';

// The shared dialog's card, floating, wider, its list scrolling between the
// heading and the buttons.
const list = css`
  :host {
    --panel-width: 34rem;
  }

  .dialog {
    padding: 1rem;
    flex-direction: column;
    max-width: none;
    max-height: min(36rem, calc(100vh - 4rem));
  }

  .dialog:popover-open {
    display: flex;
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

  /* The heading, muted as a Reminder's is, and closing in the corner. */
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
  }

  .dialog .top h2 {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 400;
  }

  .dialog button.close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin: -0.25rem -0.25rem 0 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .dialog button.close:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  .actions {
    align-items: center;
  }

  /* Shows or hides the done ones, under the list. */
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

export const remindersDialogStyles = [
  focusRingStyles,
  dialogStyles,
  floatingStyles,
  list
];
