import { css } from 'lit';

// A source's Supports: a label, then a pill for each of the person's Facts,
// tinted and ticked for those its Citation supports, dashed for those its
// Transcription suggests.
export const citationSupportsStyles = css`
  :host {
    display: block;
    margin-top: 0.5rem;
  }

  .label {
    margin-bottom: 0.25rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  button {
    padding: 0.1rem 0.5rem;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  button[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--card));
    color: var(--fg);
  }

  button[aria-pressed='true']::before {
    content: '✓ ';
  }

  button.suggested {
    border-style: dashed;
    border-color: var(--accent);
    color: var(--accent);
  }

  button.suggested::before {
    content: '? ';
  }

  .says {
    color: var(--caution);
  }

  .error {
    margin: 0.3rem 0 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
`;
