import { css } from 'lit';

// A Reminder's row and the form writing a new one: its text, the muted
// lines of what it's on, and small light buttons under it.
export const reminderStyles = css`
  :host {
    display: block;
  }

  .lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .lines > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A line that goes where it says: the person, or the Citation or Image. */
  button.go {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button.go:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .chip {
    margin-left: 0.4rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  p.text {
    margin: 0 0 0.15rem;
    font-size: 0.9rem;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 4.5rem;
    margin: 0.35rem 0;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.9rem;
    resize: vertical;
  }

  .buttons {
    display: flex;
    gap: 0.25rem;
    margin: 0.15rem -0.5rem 0;
  }

  .buttons.end {
    justify-content: flex-end;
    margin-right: 0;
  }

  .buttons button {
    padding: 0.15rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .buttons button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  .buttons button.primary {
    color: var(--accent);
  }

  .buttons button.primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--on-accent);
  }

  p.error {
    margin: 0.25rem 0 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
`;
