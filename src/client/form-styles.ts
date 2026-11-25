import { css } from 'lit';

// A dropdown drawn as a text field is, not as the system's own control,
// which WebKit draws shorter and in its own colours whatever the padding
// and border: its own chevron at the end instead, in the muted colour.
export const selectStyles = css`
  select {
    appearance: none;
    padding-right: 1.6rem;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--muted) 50%),
      linear-gradient(135deg, var(--muted) 50%, transparent 50%);
    background-position:
      calc(100% - 0.85rem) 50%,
      calc(100% - 0.55rem) 50%;
    background-size: 0.3rem 0.3rem;
    background-repeat: no-repeat;
  }
`;

// A small form, as an Event's in the panel or a new person's on the chart:
// its fields labelled on the left, the buttons at the end, a refusal in
// red above them.
const form = css`
  :host {
    display: block;
  }

  .form {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  label {
    display: grid;
    grid-template-columns: 5.75rem 1fr;
    align-items: center;
    gap: 0.5rem;
  }

  label span {
    color: var(--muted);
  }

  input,
  select {
    min-width: 0;
    box-sizing: border-box;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--fg);
    font: inherit;
  }

  .buttons {
    display: flex;
    gap: 0.25rem;
    margin: 0.15rem -0.4rem -0.2rem;
  }

  .buttons.end {
    justify-content: flex-end;
  }

  .gap {
    flex: 1;
  }

  .buttons button {
    padding: 0.15rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font: inherit;
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

  .buttons button.danger {
    color: var(--danger);
  }

  .buttons button.danger:hover:not(:disabled) {
    background: var(--danger);
    color: var(--on-accent);
  }

  p {
    margin: 0;
  }

  p.error {
    color: var(--danger);
    font-size: 0.85rem;
  }
`;

export const formStyles = [form, selectStyles];
