import { css } from 'lit';

export const treeViewStyles = css`
  :host {
    --sl-anim-move: 350ms;
    --sl-anim-fade: 200ms;
    --sl-ease: cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    height: calc(100vh - 48px);
  }

  .toolbar {
    position: relative;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  input[type='search'] {
    flex: 1;
    max-width: 420px;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  .results {
    position: absolute;
    top: calc(100% + 2px);
    left: 1rem;
    width: min(420px, calc(100% - 2rem));
    max-height: 320px;
    overflow-y: auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    z-index: 20;
  }

  .results button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.6rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-bottom: 1px solid var(--border);
    font: inherit;
    cursor: pointer;
  }

  .results button:hover {
    background: var(--bg);
  }

  .results .meta {
    color: var(--muted);
    font-size: 0.85em;
    margin-left: 0.4em;
  }

  .canvas {
    flex: 1;
    overflow: hidden;
    background: var(--bg);
    position: relative;
    cursor: grab;
    touch-action: none;
  }

  .canvas.dragging {
    cursor: grabbing;
  }

  .pan {
    position: absolute;
    top: 0;
    left: 0;
    will-change: transform;
  }

  .empty {
    padding: 2rem;
    color: var(--muted);
    text-align: center;
  }

  .node rect.box {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 1;
  }

  .node.focus rect.box {
    stroke: var(--accent);
    stroke-width: 2;
  }

  .node text {
    fill: var(--fg);
    font-size: 13px;
  }

  .node text.name {
    font-weight: 600;
  }

  .node text.dates {
    fill: var(--muted);
    font-size: 11px;
  }

  .node .hit {
    fill: transparent;
    cursor: pointer;
  }

  .node:hover rect.box {
    stroke: var(--accent);
  }

  .placeholder-avatar {
    fill: var(--border);
  }

  .edge {
    stroke: var(--muted);
    stroke-width: 1.2;
    fill: none;
  }

  /* Layout snaps on focus change — only opacity is animated, for fade-in of
     freshly-rendered nodes/edges. Transform / d are not transitioned, which
     keeps the focus-change behaviour predictable while we work out the
     correct combined pan + node motion. */
  .node {
    animation: sl-enter var(--sl-anim-fade) ease-out both;
  }

  .edge {
    animation: sl-enter var(--sl-anim-fade) ease-out both;
  }

  @keyframes sl-enter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;
