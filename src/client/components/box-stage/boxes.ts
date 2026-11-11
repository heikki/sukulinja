import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point, Transform } from '@/client/pan-zoom';
import type { Box } from '@/common/types';

import { boxOnStage } from './geometry';
import { stageBoxesStyles } from './styles';

// One Box drawn over the picture, keyed as the list beside it keys its
// rows. A `marked` one always shows, as the one the viewer is on; `faint`,
// it waits to be taken back.
export interface StageBox {
  key: string;
  box: Box;
  marked: boolean;
  faint?: boolean;
}

// A press moving further than this is a pan, not a click.
const CLICK_SLOP_PX = 4;

// Over the picture, moved with it: the Boxes, each showing while it's
// marked or its key is `hovered`. The marked ones take the pointer, and
// with `live` all do. Hovering one names its key with `box-hover` (null on
// leaving), and clicking it names it with `box-pick`. A marked one is
// marked `data-own`, for a menu a right-click opens on it. Presses, wheels
// and pinches carry on to the stage, so a drag starting on a Box still
// pans.
@customElement('sl-stage-boxes')
class StageBoxesElement extends LitElement {
  static override styles = stageBoxesStyles;

  @property({ attribute: false }) boxes: StageBox[] = [];
  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) hovered: string | null = null;
  @property({ type: Boolean, reflect: true }) live = false;

  private pressedAt: Point | null = null;

  private ask(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private onClick(e: MouseEvent, key: string) {
    const from = this.pressedAt;
    this.pressedAt = null;
    if (from === null) return;
    const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
    if (moved < CLICK_SLOP_PX) this.ask('box-pick', key);
  }

  private renderBox(b: StageBox, view: Transform) {
    const at = boxOnStage(b.box, view);
    const classes = [
      'box',
      b.marked ? 'marked' : '',
      b.faint === true ? 'faint' : '',
      b.key === this.hovered ? 'hovered' : ''
    ].join(' ');
    return html`
      <div
        class=${classes}
        data-own=${b.marked ? 'true' : nothing}
        style="left: ${at.left}px; top: ${at.top}px; width: ${
          at.width
        }px; height: ${at.height}px"
        @mousedown=${(e: MouseEvent) => {
          this.pressedAt = { x: e.clientX, y: e.clientY };
        }}
        @click=${(e: MouseEvent) => {
          this.onClick(e, b.key);
        }}
        @mouseenter=${() => {
          this.ask('box-hover', b.key);
        }}
        @mouseleave=${() => {
          this.ask('box-hover', null);
        }}
      ></div>
    `;
  }

  override render() {
    const { view } = this;
    if (view === null) return nothing;
    return this.boxes.map((b) => this.renderBox(b, view));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-stage-boxes': StageBoxesElement;
  }
}
