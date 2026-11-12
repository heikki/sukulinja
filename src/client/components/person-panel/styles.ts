import { css } from 'lit';

import { silhouetteStyles } from '../tree-view/silhouette';

// Label and value side by side, the labels muted in a column of their own.
export const definitionListStyles = css`
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

export const personPanelStyles = css`
  :host {
    display: block;
    overflow-y: auto;
    background: var(--card);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .body {
    padding: 0 1.1rem 2rem;
  }

  .body.muted {
    padding-top: 1rem;
  }

  /* The last person's view, dimmed only once the next one is slow to come,
     so a quick change doesn't flash. */
  .body.stale {
    opacity: 0.55;
    transition: opacity 0.15s 0.2s;
  }

  /* Sections are banded across the panel's full width. */
  section {
    margin: 0 -1.1rem;
    border-bottom: 1px solid var(--border);
  }

  .section-body {
    padding: 0 1.1rem 0.85rem;
  }

  h3 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* A section heading that shows or hides the section, its chevron at the
     far right as on the dock's header. It fills the heading's band, so all
     of the band takes the hover and the click. */
  button.toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.85rem 1.1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    text-align: left;
    cursor: pointer;
  }

  button.toggle::after {
    content: '›';
    font-size: 1rem;
    font-weight: 400;
    line-height: 1;
    transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1);
  }

  button.toggle[aria-expanded='true']::after {
    transform: rotate(90deg);
  }

  button.toggle:hover {
    color: var(--fg);
  }

  button.toggle:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  .muted {
    color: var(--muted);
  }

  /* Each household after the first, ruled off from the one before. */
  .family + .family {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  /* A person of the household, their relation in a column of its own so
     the names line up; tinted across the panel's width, as a source is,
     as clicking picks them. */
  .relative {
    display: flex;
    gap: 0.75rem;
    width: calc(100% + 2.2rem);
    margin: 0 -1.1rem;
    padding: 0.3rem 1.1rem;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .relative:hover {
    background: color-mix(in srgb, var(--accent) 7%, var(--card));
  }

  .relative:focus-visible {
    outline-offset: -2px;
  }

  .relation {
    flex: none;
    width: 5.5rem;
    color: var(--muted);
  }

  .person {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .life {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .life .cross {
    font-size: 1.15em;
  }

  /* The Photos as square thumbnails, cut to fill; the one the Photo
     viewer shows ringed in accent. */
  .photos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
    gap: 0.4rem;
  }

  button.photo {
    aspect-ratio: 1;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    cursor: pointer;
  }

  button.photo:hover {
    border-color: var(--accent);
  }

  button.photo.viewing {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  button.photo img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const personHeaderStyles = [
  silhouetteStyles,
  css`
    /* As tall as a name over birth and death lines, so the header stands
       the same for the living, their lines centred beside the portrait. */
    :host {
      --name-size: 1.15rem;
      --name-leading: 1.3;
      --line-size: 0.8rem;
      --line-leading: 1.4;
      --lines-gap: 0.2rem;
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-width: 0;
      min-height: calc(
        var(--name-size) * var(--name-leading) + var(--lines-gap) + 2 *
          var(--line-size) * var(--line-leading)
      );
    }

    .portrait {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
    }

    .who {
      min-width: 0;
    }

    .name {
      display: block;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-size: var(--name-size);
      font-weight: 600;
      line-height: var(--name-leading);
      text-align: left;
      overflow-wrap: anywhere;
      cursor: pointer;
    }

    .name:hover {
      text-decoration: underline;
    }

    sl-name-form {
      flex: 1;
      font-size: 0.875rem;
    }

    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0 0.6rem;
      margin: var(--lines-gap) 0 0;
      font-size: var(--line-size);
      line-height: var(--line-leading);
    }

    dt {
      color: var(--muted);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    dd.unknown {
      color: var(--muted);
    }
  `
];
