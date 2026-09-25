import { css } from 'lit';

import { styles as rendererStyles } from './renderer';

export const treeViewStyles = css`
  :host {
    /* Enter/Leave fade timing — defaults; the element overrides these per the
       active Schedule on .canvas, and they cascade into the svg. Move timing is
       JS-side (Web Animations), so it has no variables here. */
    --sl-enter-delay: 0ms;
    --sl-enter-duration: 200ms;
    --sl-enter-easing: ease-out;
    --sl-leave-delay: 0ms;
    --sl-leave-duration: 200ms;
    --sl-leave-easing: ease-in;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* Bar metrics kept in sync with the chooser's header (app styles) so the
     title doesn't shift between the chooser and a tree view. */
  .toolbar {
    position: relative;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 3.25rem;
    box-sizing: border-box;
    padding: 0.5rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  sl-person-search {
    margin-left: auto;
    width: min(420px, 45vw);
  }

  .gen {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85em;
    color: var(--muted);
  }

  .gen input[type='range'] {
    width: 80px;
  }

  .canvas {
    flex: 1;
    overflow: hidden;
    background: var(--bg);
    position: relative;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .canvas.dragging {
    cursor: grabbing;
  }

  .pan {
    position: absolute;
    top: 0;
    left: 0;
    /* Scale around the SVG's top-left so the viewport-transform math
       (screen = pan + scale * local) holds. */
    transform-origin: 0 0;
    will-change: transform;
  }

  /* The viewBox/width snap to the new extents the instant a relayout commits,
     but cards slide in from their old spots over the move. Don't clip them to
     the (possibly smaller) new box mid-slide — .canvas still bounds the view. */
  .pan svg {
    overflow: visible;
  }

  .empty {
    padding: 2rem;
    color: var(--muted);
    text-align: center;
  }

  ${rendererStyles}
`;
