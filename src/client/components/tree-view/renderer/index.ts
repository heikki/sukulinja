// The default chart renderer bundle: dims (consumed by emit), styles
// (chart-paint CSS), and the paint functions for boxes and edges. Swapping
// this whole object on TreeViewElement changes the chart's visual identity
// — including sizing — without parent-side restructuring. See ADR-0004.

import { css, svg } from 'lit';

import type { DrawnLine } from '../emit';
import { makeRenderBox } from './box';

const dims = {
  boxW: 184,
  boxH: 90,
  gapX: 28,
  gapY: 70,
  tieOffset: 6
};

const styles = css`
  .node rect.box {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
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

  .avatar-img {
    clip-path: circle(50%);
  }

  .edge {
    stroke: var(--muted);
    stroke-width: 1.2;
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  /* Focus change snaps — only opacity is animated, for fade-in of newly
     rendered nodes and edges. The Pin keeps the focused node visually fixed
     across the snap. */
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

function renderEdge(line: DrawnLine) {
  return svg`<path
    class="edge ${line.kind}"
    d="M ${line.from.x} ${line.from.y} L ${line.to.x} ${line.to.y}"
  />`;
}

export const defaultRenderer = {
  dims,
  styles,
  renderBox: makeRenderBox(dims),
  renderEdge
};
