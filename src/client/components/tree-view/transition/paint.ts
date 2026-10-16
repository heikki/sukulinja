import { nothing, svg } from 'lit';

import type { PersonRow } from '@common/types';

import { renderBox, renderEdge } from '../renderer';
import type { TransitionController } from './controller';
import type { Schedule } from './schedule';

// Mirror the active Schedule's Enter/Leave timing into the CSS custom properties
// the fade animations read (Move timing is applied JS-side). Set on .canvas so
// it cascades into the svg's .node/.edge/.ghosts.
export function scheduleVars(schedule: Schedule) {
  const { enter, leave } = schedule;
  return [
    `--sl-enter-delay:${enter.delay}ms`,
    `--sl-enter-duration:${enter.duration}ms`,
    `--sl-enter-easing:${enter.easing}`,
    `--sl-leave-delay:${leave.delay}ms`,
    `--sl-leave-duration:${leave.duration}ms`,
    `--sl-leave-easing:${leave.easing}`
  ].join(';');
}

// Departing boxes/edges, drawn through the normal renderers so they look
// identical to live cards, in a non-interactive overlay that holds each at its
// last screen spot while it fades out.
export function renderGhosts(
  leaving: TransitionController['leaving'],
  persons: Map<number, PersonRow>
) {
  if (leaving.boxes.length === 0 && leaving.edges.length === 0) {
    return nothing;
  }
  const { x, y } = leaving.origin;
  // A canvas-sized overlay under the chart: the ghosts sit at their last screen
  // spot whatever the new chart's extents are. Chart 0,0 lands at the captured
  // origin; the old scale keeps them at their old size.
  return svg`
    <svg class="ghost-layer">
      <g
        class="ghosts"
        style="transform: translate(${x}px, ${y}px) scale(${leaving.scale}); transform-origin: 0 0"
      >
        ${leaving.edges.map((l) => renderEdge(l, false, true))}
        ${leaving.boxes.map((b) => {
          const person = persons.get(b.personId);
          if (person === undefined) return nothing;
          return renderBox(b, person, {
            focus: false,
            entering: false,
            ghost: true
          });
        })}
      </g>
    </svg>
  `;
}
