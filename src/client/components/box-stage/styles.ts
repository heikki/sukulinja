import { css } from 'lit';

import { focusRingStyles } from '@/client/focus-ring';

// What the Scan viewer and the Photo viewer share: their controls, the
// viewer over the chart with its stage, its toolbar, the pane beside the
// picture, the Boxes over it, the bar floating at its foot, and Cancel and
// Save there while a Box is pending.

// Buttons, fields and links, shared by the viewer and its toolbar.
const controls = css`
  .muted {
    color: var(--muted);
  }

  input {
    -webkit-user-select: text;
    width: 4.5em;
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    text-align: right;
  }

  button {
    padding: 0.15rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button.plain {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
  }

  button.plain:hover {
    text-decoration: underline;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

// What every part of the viewer with controls takes: the shared focus ring,
// then the controls themselves.
export const controlStyles = [focusRingStyles, controls];

// A viewer: covers the chart, a toolbar over its body, the stage and the
// pane beside it.
export const viewerStyles = css`
  /* Covers the chart, not the dock: the dock still shows whose source it is.
     Under the chart's corner (Search, the lists, Settings), which stays. */
  :host {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    font-size: 0.875rem;
    line-height: 1.4;
    /* Covering the chart, it's plain where focus is: no ring. */
    outline: none;
  }

  /* The picture, and the people in it beside. */
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
  }

  .stage.dragging {
    cursor: grabbing;
  }

  /* Scaled around its top-left so screen = pan + scale * image pixel. */
  .stage img {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* Loading out of sight, or waiting for its turn to show. */
  .stage img.hidden {
    opacity: 0;
  }

  .note {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--muted);
    pointer-events: none;
  }

  .note button {
    pointer-events: auto;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card) 85%, transparent);
    color: var(--fg);
    box-shadow: 0 1px 6px rgb(0 0 0 / 0.2);
  }

  .loading::before {
    content: '';
    width: 0.8rem;
    height: 0.8rem;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading.later {
    animation: appear 0.2s ease-out 0.15s both;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
`;

// A viewer's one row: its title, shortened with an ellipsis where it must be. The
// chart's corner floats over its right end, so the title lines up with the
// corner, and the row leaves it room: the search's width, two buttons and
// the gaps.
export const toolbarStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2rem;
    padding: 0.75rem calc(min(280px, 40vw) + 6.75rem) 0.75rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    /* The search field's line height, so the title's text sits level with
       the field's; the viewer's 1.4 sets it a pixel higher. Even so it
       reads as high, mostly small letters under its capitals: a pixel
       lower looks centred. */
    line-height: normal;
    position: relative;
    top: 1px;
  }
`;

// A column beside the picture; collapsed, a strip with the button to bring
// it back.
export const sidePaneStyles = css`
  /* Its width is set as it slides, to a rail as narrow as the person dock's
     on the other side. */
  :host {
    position: relative;
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--card);
    border-left: 1px solid var(--border);
  }

  /* Laid out at full width and pinned to the pane's left edge, so the list
     slides in with the edge rather than reflowing as the pane grows. */
  .content {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
  }

  /* The whole header hides the list; the chevron marks it as a control. */
  button.head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0 0.5rem 0.75rem;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: var(--card);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Where the closed rail's chevron is: centred in its width. */
  .chevron {
    width: 2.5rem;
    color: var(--muted);
    font-size: 1rem;
    text-align: center;
  }

  /* Hovered as the person dock's header and rail are: a tint, the chevron
     in accent, the text and edge as they were. */
  button.head:hover,
  button.rail:hover {
    border-color: var(--border);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    color: var(--fg);
  }

  button.head:hover .chevron,
  button.rail:hover {
    color: var(--accent);
  }

  button.rail {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    /* Its chevron where the open header's is. */
    padding: 0.625rem 0 0.75rem;
    border: 0;
    border-radius: 0;
    background: var(--card);
    color: var(--muted);
    cursor: pointer;
    transition: opacity 120ms ease;
  }

  :host(:not([collapsed])) button.rail {
    opacity: 0;
    pointer-events: none;
  }

  .rail-heading {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0 0.75rem;
  }
`;

// The rows slotted into the pane: groups of people, each a button picking
// them, the one the viewer is on marked, and the one hovered on the
// picture highlighted.
export const paneRowsStyles = css`
  h3 {
    margin: 1.1rem 0.75rem 0.25rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  h3:first-child {
    margin-top: 0.6rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  p {
    margin: 0.6rem 0.75rem;
  }

  button.row {
    display: block;
    width: 100%;
    padding: 0.3rem 0.75rem;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0;
    background: none;
    text-align: left;
  }

  button.row:hover,
  button.row.hovered {
    background: var(--bg);
    color: var(--fg);
  }

  button.row.hovered .name {
    color: var(--accent);
  }

  button.row.current {
    border-left-color: var(--accent);
    background: var(--bg);
  }

  .name {
    font-weight: 500;
  }

  /* As the person search shows them: muted, a size down. */
  .dates {
    margin-left: 0.4em;
    color: var(--muted);
    font-size: 0.85em;
  }
`;

// Over the stage, letting presses through but on the marked Boxes, or with
// `live`, on all. Red stands out on the grey scans; a viewer can tint them
// otherwise with --box-color. Unmarked, a Box shows only when hovered.
export const stageBoxesStyles = css`
  :host {
    --box: var(--box-color, var(--danger));
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .box {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid transparent;
    border-radius: 3px;
  }

  .box.marked,
  :host([live]) .box {
    pointer-events: auto;
    cursor: pointer;
  }

  .box.marked {
    border-color: var(--box);
    background: color-mix(in srgb, var(--box) 12%, transparent);
  }

  .box.marked.faint {
    border-style: dashed;
    opacity: 0.7;
  }

  .box.hovered {
    border-color: var(--box);
    background: color-mix(in srgb, var(--box) 25%, transparent);
  }
`;

// The Box not saved yet: dashed, so it reads as not saved, with its
// handles. No stacking of its own, so the Box stacks with the viewer's
// parts: under the nav (2), the menus over it.
export const boxHandlesStyles = css`
  :host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .box {
    pointer-events: auto;
  }

  /* The pending Box: red as the entries' Boxes are, but dashed, so it
     reads as not saved yet. */
  .box {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 2px dashed var(--danger);
    border-radius: 3px;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    cursor: move;
  }

  .grip {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -6px 0 0 -6px;
    border: 1px solid color-mix(in srgb, var(--danger) 70%, black);
    border-radius: 2px;
    background: var(--danger);
  }

  .grip.n,
  .grip.s {
    left: 50%;
    cursor: ns-resize;
  }

  .grip.e,
  .grip.w {
    top: 50%;
    cursor: ew-resize;
  }

  .grip.n,
  .grip.ne,
  .grip.nw {
    top: 0;
  }

  .grip.s,
  .grip.se,
  .grip.sw {
    top: 100%;
  }

  .grip.w,
  .grip.nw,
  .grip.sw {
    left: 0;
  }

  .grip.e,
  .grip.ne,
  .grip.se {
    left: 100%;
  }

  .grip.ne,
  .grip.sw {
    cursor: nesw-resize;
  }

  .grip.nw,
  .grip.se {
    cursor: nwse-resize;
  }
`;

// Floating over the foot of the picture, centred, in one row.
export const footBarStyles = css`
  :host {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    box-sizing: border-box;
    /* Within the stage: a long row gives way where it can, as the new
       Citation's text does. */
    max-width: calc(100% - 2rem);
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--card) 92%, transparent);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    white-space: nowrap;
    cursor: auto;
  }
`;

// What's asked while a Box is pending, or a removal waits: Cancel beside
// Save or the removal, and why a save was refused.
export const editActionsStyles = css`
  p {
    margin: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  button {
    white-space: nowrap;
  }

  button.save {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }

  button.save:hover:not(:disabled) {
    color: var(--bg);
    filter: brightness(1.1);
  }

  button.discard {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--bg);
  }

  button.discard:hover:not(:disabled) {
    color: var(--bg);
    filter: brightness(1.1);
  }

  .refused {
    color: var(--danger);
    font-size: 0.8rem;
  }
`;
