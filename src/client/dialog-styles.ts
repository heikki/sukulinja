import { css } from 'lit';

// The buttons that end a modal's card:
// side by side at the end, the step coloured, red with `danger` where it
// takes away what can't be got back, or the accent with `primary`.
export const actionStyles = css`
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }
  .actions button {
    padding: 0.35rem 0.9rem;
    background: none;
    color: var(--fg);
    border: 1px solid var(--raised-border);
    border-radius: 6px;
    font: inherit;
    text-align: center;
    cursor: pointer;
  }
  .actions button:hover:not(:disabled),
  .actions button:focus-visible {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .actions button.danger,
  .actions button.danger:hover:not(:disabled),
  .actions button.danger:focus-visible {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-danger);
  }
  .actions button.primary,
  .actions button.primary:hover:not(:disabled),
  .actions button.primary:focus-visible {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
`;

// A modal: a scrim over the window and a card on it, its title, what it
// says, then its buttons. sl-ask draws its card so; a form in a modal takes
// `dialogStyles` itself.
const dialog = css`
  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--scrim);
    z-index: 10;
  }
  .dialog {
    width: 100%;
    max-width: 22rem;
    box-sizing: border-box;
    margin: 1rem;
    padding: 0.9rem 1rem;
    background: var(--raised);
    border: 1px solid var(--raised-border);
    border-radius: 8px;
    box-shadow:
      0 10px 30px var(--shadow),
      0 2px 6px var(--shadow);
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: left;
  }
  .dialog h2 {
    margin: 0 0 0.6rem;
    font-size: 1em;
  }
  .dialog p {
    margin: 0 0 1.2rem;
    color: var(--fg);
  }
`;

export const dialogStyles = [actionStyles, dialog];
