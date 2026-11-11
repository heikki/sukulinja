import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point, Transform, Viewport } from '@/client/pan-zoom';
import type { Box } from '@/common/types';

import { boxFromStage, boxOnStage, clampBox, wholeBox } from './geometry';
import { boxHandlesStyles } from './styles';

// The parts of a Box a drag can take: an edge, a corner, or all of it.
type Grip = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

const GRIPS: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// A drag under way: from where, and the Box it started on.
interface BoxDrag {
  grip: Grip;
  from: Point;
  start: Box;
}

// The Box a drag of `grip` by `d` (in pixels of the picture of `size`)
// gives.
export function dragged(start: Box, grip: Grip, d: Point, size: Viewport) {
  if (grip === 'move') {
    const left = Math.min(
      Math.max(0, start.left + d.x),
      size.width - start.width
    );
    const top = Math.min(
      Math.max(0, start.top + d.y),
      size.height - start.height
    );
    return { ...start, left, top };
  }
  let { left, top } = start;
  let right = left + start.width;
  let bottom = top + start.height;
  if (grip.includes('w')) left = Math.min(left + d.x, right);
  if (grip.includes('e')) right = Math.max(right + d.x, left);
  if (grip.includes('n')) top = Math.min(top + d.y, bottom);
  if (grip.includes('s')) bottom = Math.max(bottom + d.y, top);
  return clampBox(
    { left, top, width: right - left, height: bottom - top },
    size
  );
}

// A Box not saved yet, over the picture of `size`, with handles to move
// and resize it. Let go, it names the Box it was dragged to, in whole
// pixels, with `box-set`. Presses on it stay here, so they don't pan the
// picture; Esc stops a drag before the viewer's Esc closes anything. It's
// marked `data-own`, for a menu a right-click opens on it.
@customElement('sl-box-handles')
class BoxHandlesElement extends LitElement {
  static override styles = boxHandlesStyles;

  @property({ attribute: false }) box: Box | null = null;
  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) size: Viewport | null = null;

  @state() private drag: BoxDrag | null = null;
  // The Box as a drag has it, before it's let go.
  @state() private live: Box | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
  }

  private toStage(e: MouseEvent): Point {
    const rect = this.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || this.drag === null) return;
    e.preventDefault();
    e.stopPropagation();
    this.drag = null;
    this.live = null;
  };

  private start(e: MouseEvent, grip: Grip, start: Box) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.drag = { grip, from: this.toStage(e), start };
    this.live = start;
  }

  private readonly onMove = (e: MouseEvent) => {
    const { drag, view, size } = this;
    if (drag === null || view === null || size === null) return;
    const at = this.toStage(e);
    const d = boxFromStage(
      {
        left: view.pan.x + at.x - drag.from.x,
        top: view.pan.y + at.y - drag.from.y,
        width: 0,
        height: 0
      },
      view
    );
    this.live = dragged(drag.start, drag.grip, { x: d.left, y: d.top }, size);
  };

  private readonly onUp = () => {
    const { drag, live, size } = this;
    if (drag === null) return;
    this.drag = null;
    this.live = null;
    if (live === null || size === null) return;
    this.dispatchEvent(
      new CustomEvent('box-set', { detail: wholeBox(live, size) })
    );
  };

  override render() {
    const { view } = this;
    const box = this.live ?? this.box;
    if (view === null || box === null) return nothing;
    const at = boxOnStage(box, view);
    return html`
      <div
        class="box"
        data-own="true"
        style="left: ${at.left}px; top: ${at.top}px; width: ${at.width}px; height: ${at.height}px"
        @mousedown=${(e: MouseEvent) => {
          this.start(e, 'move', box);
        }}
      >
        ${GRIPS.map(
          (g) =>
            html`<span
              class="grip ${g}"
              @mousedown=${(e: MouseEvent) => {
                this.start(e, g, box);
              }}
            ></span>`
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-box-handles': BoxHandlesElement;
  }
}
