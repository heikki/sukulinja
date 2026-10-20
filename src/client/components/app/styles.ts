import { css } from 'lit';

export const appStyles = css`
  /* A full-height column, so the chooser and empty screens can sit centred
     while their content is short. */
  :host {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  /* No bar: Settings floats in the top-right corner, where the chart keeps
     it too (tree-view styles), and the window's title names the app. */
  sl-settings {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
  }
  .center {
    width: 100%;
    max-width: 32rem;
    box-sizing: border-box;
    margin: auto;
    padding: 1.5rem 1.5rem calc(1.5rem + 20vh);
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
  /* Padding, not margin, for the breathing room: auto margins centre it and
     fall to zero once the list outgrows the window. The extra bottom padding
     lifts it above true centre, where it reads as centred. */
  .page {
    width: 100%;
    max-width: 36rem;
    box-sizing: border-box;
    margin: auto;
    padding: 3rem 1.5rem calc(3rem + 20vh);
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
  .dialog .muted {
    color: var(--muted);
  }
  .error {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0 0 1rem;
    padding: 0.65rem 0.85rem;
    background: color-mix(in srgb, var(--danger) 10%, var(--card));
    border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--card));
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .error strong {
    color: var(--danger);
    font-weight: 600;
  }
  .center .error {
    margin: 1.25rem 0 0;
    text-align: left;
  }
  .error .message {
    max-height: 6.5rem;
    overflow-y: auto;
    overflow-wrap: anywhere;
    color: var(--fg);
    user-select: text;
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
  .dialog .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--muted);
  }
  .dialog .field input {
    padding: 0.55rem 0.7rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    font-size: 0.95rem;
    font-weight: 400;
  }
  .dialog .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .dialog .hint {
    font-weight: 400;
  }
  .dialog .hint strong {
    color: var(--fg);
  }
  .import-dialog {
    max-width: 32rem;
    padding: 1.5rem 1.75rem;
  }
  /* Names the picked file, ellipsised so a long one keeps to one line. */
  .import-dialog h2 {
    margin-bottom: 1.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* One line, so the dialog holds its height as progress messages stream. */
  .import-dialog .status {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .import-dialog .actions {
    margin-top: 1.5rem;
  }
`;
