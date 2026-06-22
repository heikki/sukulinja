import { css } from 'lit';

export const appStyles = css`
  :host {
    display: block;
  }
  /* Bar metrics kept in sync with .toolbar in tree-view styles so the title
     doesn't shift when moving between the chooser and a tree view. */
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 3.25rem;
    box-sizing: border-box;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }
  h1 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .center {
    max-width: 32rem;
    margin: 4rem auto;
    padding: 1.5rem;
    text-align: center;
  }
  .center h2 {
    margin: 0 0 0.5rem;
    font-size: 1.3rem;
  }
  .center p {
    color: var(--muted);
    margin: 0 0 1.5rem;
  }
  .center code {
    background: var(--bg);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  ul.chooser {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  ul.chooser li {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }
  ul.chooser a {
    display: block;
    flex: 1;
    text-align: left;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--fg);
    text-decoration: none;
  }
  ul.chooser a:hover {
    border-color: var(--accent);
  }
  .muted {
    color: var(--muted);
    font-size: 0.85em;
  }
  button.import {
    padding: 0.25rem 0.75rem;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  button.import:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button.import:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    color: #c0392b;
    font-size: 0.85em;
    margin-top: 0.75rem;
  }
  button.delete {
    align-self: center;
    padding: 0.25rem 0.75rem;
    background: var(--card);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  button.delete:hover {
    color: #c0392b;
    border-color: #c0392b;
  }
  button.brand {
    padding: 0;
    margin-right: 0.5rem;
    background: none;
    border: none;
    font: inherit;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--fg);
    cursor: pointer;
    white-space: nowrap;
  }
  button.brand:hover {
    color: var(--accent);
  }
  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    z-index: 10;
  }
  .dialog {
    max-width: 24rem;
    margin: 1rem;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
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
    padding: 0.4rem 1rem;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  .dialog button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .dialog button.danger {
    background: #c0392b;
    border-color: #c0392b;
    color: #fff;
  }
  .dialog button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .dialog .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0 0 0.75rem;
    font-size: 0.9em;
    color: var(--muted);
  }
  .dialog .field input {
    padding: 0.4rem 0.6rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
  }
  .dialog .field input:focus {
    outline: none;
    border-color: var(--accent);
  }
`;
