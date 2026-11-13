import { css } from 'lit';

// Sources: each a row across the panel's width, under its group's
// heading, tinted when clicking it does something, and marked when the
// Scan viewer shows it.
export const personSourcesStyles = css`
  :host {
    display: block;
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

  /* The one it's open on while it shows no Image of its own, moved off
     it or with none set: on the page background still, but without the
     bar, so a Citation placed there is seen to be this one. */
  .source.elsewhere {
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

  /* Support the Transcription suggests, to see in supports.ts. */
  .suggested {
    margin-top: 0.2rem;
    color: var(--accent);
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

  /* The less a Link can be trusted, the louder its chip: a Marked one stays
     plain, a Match is orange, an Estimate red. The label still names it. */
  .chip[data-certainty='match'] {
    --tone: var(--caution);
  }

  .chip[data-certainty='estimated'] {
    --tone: var(--danger);
  }

  .chip:is([data-certainty='match'], [data-certainty='estimated']) {
    background: color-mix(in srgb, var(--tone) 16%, transparent);
    color: var(--tone);
  }

  .sites {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-top: 0.5rem;
  }

  /* Finding the parish's archive in Astia, or changing it, and deleting
     the Citation: quiet text buttons, one to a line. */
  button.delete {
    display: block;
    margin-top: 0.4rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--danger);
    font: inherit;
    cursor: pointer;
  }

  button.delete:hover {
    text-decoration: underline;
  }

  .asking {
    margin-top: 0.5rem;
  }

  button.archive {
    margin-top: 0.4rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }

  button.archive:hover {
    text-decoration: underline;
  }

  .finding {
    margin-top: 0.5rem;
  }

  .finding .hint {
    margin: 0 0 0.35rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;
