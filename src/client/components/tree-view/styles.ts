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
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* No bar above the chart: Search and Settings float in its top-right
     corner, so the chart and the details panel take the window's height. */
  .corner {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 5;
    display: flex;
    gap: 0.75rem;
  }

  sl-person-search {
    width: min(280px, 40vw);
  }

  /* The chart and, beside it, the selected person's details panel. */
  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* The chart, with the Scan viewer laid over it when open. */
  .chart-area {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
  }

  .canvas {
    flex: 1;
    overflow: hidden;
    background: var(--bg);
    position: relative;
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
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

  /* Departing items fade in a canvas-sized layer under the chart: the chart's SVG
     snaps to the new, possibly much smaller, extents and WebKit clips what
     overflows it. */
  .ghost-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .empty {
    padding: 2rem;
    color: var(--muted);
    text-align: center;
  }

  ${rendererStyles}
`;
