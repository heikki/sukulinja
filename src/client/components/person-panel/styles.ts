import { css } from 'lit';

import { silhouetteStyles } from '../tree-view/silhouette';

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

  /* A group of sources, named as written: set apart from the sections'
     small capitals. */
  /* 1.2rem above each: the first's margin counts the heading's padding,
     and the rest count the padding of the row above. */
  h4 {
    margin: 0.75rem 0 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--fg);
  }

  h4:first-child {
    margin-top: 0.35rem;
  }

  /* A source, tinted across the panel's width when clicking it does
     something. */
  .source {
    position: relative;
    margin: 0 -1.1rem;
    padding: 0.45rem 1.1rem;
  }

  /* Under a group's heading, its sources step in. */
  h4 ~ .source {
    padding-left: 1.85rem;
  }

  .source.active {
    cursor: pointer;
  }

  .source.active:hover {
    background: color-mix(in srgb, var(--accent) 7%, var(--card));
  }

  /* The source the Scan viewer shows, marked as "People here" marks the
     viewer's own: an accent bar at the edge on the page background. */
  .source.viewing {
    background: var(--bg);
  }

  .source.viewing::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    background: var(--accent);
  }

  /* The source's lines, and its chevron centred beside them. */
  .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .lines {
    flex: 1;
    min-width: 0;
  }

  button.title {
    display: block;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: color-mix(in srgb, var(--fg) 80%, var(--muted));
    font: inherit;
    font-size: 0.825rem;
    text-align: left;
    cursor: inherit;
  }

  /* A Volume's name stays on one line. */
  .linked button.title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The whole source rings when its title has focus. */
  button.title:focus-visible {
    outline: none;
  }

  .source:has(button.title:focus-visible) {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  button.title[aria-current] {
    color: var(--fg);
    font-weight: 600;
  }

  /* Shows or hides what the source records. */
  button.fold {
    flex: none;
    width: 1.25rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 1rem;
    line-height: 1.25;
    cursor: pointer;
  }

  button.fold::after {
    content: '›';
    display: inline-block;
    transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1);
  }

  button.fold[aria-expanded='true']::after {
    transform: rotate(90deg);
  }

  button.fold:hover {
    color: var(--accent);
  }

  .record {
    cursor: auto;
  }

  .source .who {
    margin-top: 0.5rem;
  }

  .who {
    margin: 0.15rem 0 0.4rem;
    font-weight: 600;
  }

  .text {
    margin: 0.25rem 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .household {
    margin-top: 0.6rem;
    color: var(--muted);
  }

  table {
    margin-top: 0.35rem;
    border-collapse: collapse;
    width: 100%;
  }

  td {
    padding: 0.1rem 0.5rem 0.1rem 0;
    vertical-align: top;
  }

  td:first-child,
  td:last-child {
    color: var(--muted);
    white-space: nowrap;
  }

  /* The entry at the left, how its Image was found at the right. */
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }

  /* Under the Volume's name, in a quieter tone. */
  .entry {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .status .chip {
    margin-left: auto;
  }

  .chip {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.75rem;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--muted);
  }

  .sites {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-top: 0.5rem;
  }

  .reminders {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source .reminders {
    margin-top: 0.5rem;
  }

  /* A Reminder, flagged, its text as written; clicking it opens it. */
  button.reminder {
    display: flex;
    gap: 0.45rem;
    width: calc(100% + 1rem);
    margin: 0 -0.5rem;
    padding: 0.3rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    white-space: pre-line;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  button.reminder::before {
    content: '⚑';
    flex: none;
    color: var(--accent);
  }

  button.reminder:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  button.reminder:focus-visible {
    outline-offset: -2px;
  }

  button.reminder.done {
    opacity: 0.55;
  }

  .none {
    margin: 0 0 0.3rem;
  }

  /* Shows or hides the done Reminders, under the list. */
  button.show-done {
    margin-top: 0.35rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  button.show-done:hover {
    text-decoration: underline;
  }

  /* A folded source's open Reminders, counted beside its chevron. */
  button.marker {
    flex: none;
    padding: 0.05rem 0.45rem;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button.marker:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
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
      font-size: var(--name-size);
      font-weight: 600;
      line-height: var(--name-leading);
      overflow-wrap: anywhere;
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
