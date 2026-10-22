import { css } from 'lit';

// A modal asking before an action: a scrim over the window and a card on it,
// its buttons at the end. Each component with a dialog takes `dialogStyles`.
export const dialogStyles = css`
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
    max-width: 24rem;
    box-sizing: border-box;
    margin: 1rem;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 40px var(--shadow);
    text-align: left;
  }
  .dialog h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .dialog p {
    margin: 0 0 1rem;
    color: var(--fg);
  }
  .dialog .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .dialog button {
    padding: 0.45rem 1rem;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .dialog button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .dialog button.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-danger);
  }
  .dialog button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
`;
