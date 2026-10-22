import type { PersonRow } from '@common/types';
import { nothing, svg } from 'lit';

import { avatarHref } from '../avatar-cache';
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
  persons: Map<number, PersonRow>,
  mediaUrl: (storedPath: string) => string
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
            photo: avatarHref(person, mediaUrl),
            entering: false,
            ghost: true
          });
        })}
      </g>
    </svg>
  `;
}

// The order cards paint in. Entering cards render as a stable trailing block
// the sort never reorders — reordering an SVG node restarts its CSS fade, so
// a sorted entering card would flash each time a Move starts and ends. The
// rest sort the sliders first (painted behind) so stationary cards stay on
// top as movers pass under them; those carry no fade, and movers slide via
// Web Animations, which survive a same-parent reorder. A stable sort keeps
// each group's order otherwise.
export function paintOrder<T extends { key: string }>(
  boxes: T[],
  moving: ReadonlySet<string>,
  entering: ReadonlySet<string>
) {
  const fading = boxes.filter((b) => entering.has(b.key));
  const rest = boxes.filter((b) => !entering.has(b.key));
  const sorted =
    moving.size === 0
      ? rest
      : [...rest].sort(
          (a, b) => (moving.has(a.key) ? 0 : 1) - (moving.has(b.key) ? 0 : 1)
        );
  return [...sorted, ...fading];
}
