import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@client/focus-ring';
import { easeOutCubic, reducedMotion } from '@client/pan-zoom';

import { sideDockStyles } from './styles';

// The closed dock's width.
export const RAIL_PX = 40;
const MIN_PX = 260;
const MAX_PX = 640;
// How long the dock takes to open or close; a pan made alongside it takes
// as long, eased alike, so the two move in step.
export const SLIDE_MS = 200;

export type OpenChangeEvent = CustomEvent<boolean>;
export type WidthChangeEvent = CustomEvent<number>;

// A collapsible column at the chart's left edge. Open, it shows a header (the
// `header` slot, or the `heading`; clicked to collapse) over its scrolling content, at `width` with a
// resize edge; collapsed, a slim rail showing the `heading`, clicked to open. The dock animates its own width between the two, so it is
// controlled: it asks via `open-change` / `width-change` (on drag release) and
// the host sets `open` / `width` back.
@customElement('sl-side-dock')
export class SideDockElement extends LitElement {
  static override styles = [focusRingStyles, sideDockStyles];

  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Number }) width = 380;
  // What the dock holds, for its buttons' titles ("Show details").
  @property() label = '';
  @property() heading = '';

  // The painted width: trails `open` through the slide, `width` through a drag.
  @state() private shown = RAIL_PX;
  @state() private dragWidth: number | null = null;

  private slide: number | null = null;

  private get target() {
    return this.open ? (this.dragWidth ?? this.width) : RAIL_PX;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopSlide();
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('open') && this.hasUpdated && !reducedMotion()) {
      this.startSlide(this.shown, this.target);
    } else if (this.slide === null) {
      this.shown = this.target;
    }
  }

  protected override updated() {
    this.style.width = `${this.shown}px`;
  }

  private startSlide(from: number, to: number) {
    this.stopSlide();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      // Whole pixels, so the canvas origin and the held pan move in step.
      this.shown = Math.round(from + (to - from) * easeOutCubic(t));
      this.slide = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.slide = requestAnimationFrame(step);
  }

  private stopSlide() {
    if (this.slide !== null) cancelAnimationFrame(this.slide);
    this.slide = null;
  }

  private request(open: boolean) {
    this.dispatchEvent(
      new CustomEvent<boolean>('open-change', { detail: open })
    );
  }

  private readonly onResizeStart = (e: PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.width;
    const move = (m: PointerEvent) => {
      const w = startW + m.clientX - startX;
      this.dragWidth = Math.min(MAX_PX, Math.max(MIN_PX, w));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const w = this.dragWidth;
      this.dragWidth = null;
      if (w !== null && w !== this.width) {
        this.dispatchEvent(
          new CustomEvent<number>('width-change', { detail: w })
        );
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  override render() {
    const width = this.dragWidth ?? this.width;
    return html`
      <div class="content" style="width:${width}px" ?inert=${!this.open}>
        <button
          class="header"
          title=${`Hide ${this.label}`}
          @click=${() => {
            this.request(false);
          }}
        >
          <slot name="header">
            <span class="heading">${this.heading}</span>
          </slot>
          <span class="chevron" aria-hidden="true">‹</span>
        </button>
        <slot></slot>
      </div>
      <button
        class="rail"
        title=${`Show ${this.label}`}
        ?inert=${this.open}
        @click=${() => {
          this.request(true);
        }}
      >
        <span aria-hidden="true">›</span>
        <span class="rail-heading">${this.heading}</span>
      </button>
      ${
        this.open
          ? html`<div
              class="resize ${this.dragWidth === null ? '' : 'active'}"
              @pointerdown=${this.onResizeStart}
            ></div>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-side-dock': SideDockElement;
  }
}
