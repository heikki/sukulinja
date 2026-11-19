import { css } from 'lit';

// The Volume picker's: a modal over a scrim, its parishes down the side,
// the Fits box, the filters and the parish's Volumes by series.
export const volumePickerStyles = css`
  dialog {
    width: min(60rem, calc(100vw - 2rem));
    height: min(46rem, calc(100vh - 2rem));
    box-sizing: border-box;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--fg);
    box-shadow: 0 12px 40px var(--shadow);
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  .frame {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  header p {
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  button.ghost {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font-size: 0.8rem;
  }

  button.ghost:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  button:disabled {
    cursor: default;
    color: var(--muted);
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  aside {
    width: 14rem;
    flex: none;
    overflow-y: auto;
    padding: 0.75rem;
    border-right: 1px solid var(--border);
    font-size: 0.85rem;
  }

  aside h3,
  .series h3 {
    margin: 0.75rem 0.4rem 0.25rem;
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  aside button.parish {
    display: block;
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    text-align: left;
  }

  aside button.parish:hover,
  aside button.parish[aria-current='true'] {
    background: color-mix(in srgb, var(--fg) 9%, transparent);
  }

  aside button.find {
    margin-top: 0.5rem;
    padding: 0.35rem 0.5rem;
    border: 0;
    background: none;
    color: var(--accent);
  }

  main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .fits {
    padding: 0.75rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    font-size: 0.85rem;
  }

  .fits h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }

  .fit {
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.2rem 0;
  }

  .fit .why {
    color: var(--muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  /* Tall enough that scrolled to the top, under main's padding, nothing
     above it shows. */
  section.parish {
    flex: none;
    min-height: calc(100% + 1rem);
    scroll-margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
  }

  .filters .title {
    margin-right: 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  button.chip {
    padding: 0.15rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
  }

  button.chip[aria-pressed='true'] {
    border-color: transparent;
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    color: var(--fg);
  }

  .filters label {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--muted);
  }

  .filters input,
  aside sl-archive-search {
    font: inherit;
  }

  .filters input {
    width: 4rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 0.75rem 1.25rem;
  }

  .series h3 {
    margin: 0 0 0.25rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.3rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .row:hover {
    background: color-mix(in srgb, var(--fg) 6%, transparent);
  }

  .row .name {
    flex: 1;
    min-width: 0;
  }

  .muted {
    color: var(--muted);
  }

  .on {
    color: var(--muted);
    font-size: 0.8rem;
  }

  p.refused {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
`;
