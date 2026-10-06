import { css } from 'lit';

export const appStyles = css`
  :host {
    display: block;
  }
  /* Bar metrics kept in sync with .toolbar in tree-view styles so the title
     doesn't shift when moving between the chooser and a tree view. */
  header {
    display: flex;
    justify-content: space-between;
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
  .page {
    max-width: 36rem;
    margin: 3rem auto;
    padding: 0 1.5rem;
  }
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .page-head h2 {
    margin: 0;
    font-size: 1.3rem;
    letter-spacing: -0.01em;
  }
  .import-actions {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  ul.chooser {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    overflow: hidden;
  }
  ul.chooser li {
    display: flex;
    align-items: center;
  }
  ul.chooser li + li {
    border-top: 1px solid var(--border);
  }
  ul.chooser li:hover {
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }
  ul.chooser a {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
    padding: 0.8rem 1rem;
    color: var(--fg);
    text-decoration: none;
  }
  ul.chooser .name {
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85em;
  }
  button.import {
    padding: 0.4rem 0.85rem;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button.import:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  button.import:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    color: var(--danger);
    font-size: 0.85em;
    margin-top: 0.75rem;
  }
  button.delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    margin-right: 0.6rem;
    padding: 0;
    background: none;
    color: var(--muted);
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
  }
  button.delete svg {
    width: 1rem;
    height: 1rem;
  }
  button.delete:hover {
    color: var(--danger);
    border-color: var(--danger);
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
    background: var(--scrim);
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
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-danger);
  }
  .dialog button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
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
