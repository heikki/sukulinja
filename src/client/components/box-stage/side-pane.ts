import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { easeOutCubic, reducedMotion } from '@/client/pan-zoom';

import { RAIL_PX, SLIDE_MS } from '../side-dock';
import { controlStyles, sidePaneStyles } from './styles';

// Collapsed or not for the rest of the visit, across viewers and what they
// show.
let collapsed = false;

// The open pane's width.
const OPEN_PX = 256;

// A column beside the picture, under its `heading`, holding what's slotted
// into it. As the person dock does: the whole header hides it, and hidden,
// a rail with the heading brings it back.
@customElement('sl-side-pane')
class SidePaneElement extends LitElement {
  static override styles = [controlStyles, sidePaneStyles];

  @property() heading = '';

  // The painted width: trails `collapsed` through the slide, as the person
  // dock's does.
  @state() private shown = collapsed ? RAIL_PX : OPEN_PX;
  private slide: number | null = null;

  private readonly toggle = () => {
    collapsed = !collapsed;
    this.toggleAttribute('collapsed', collapsed);
    const to = collapsed ? RAIL_PX : OPEN_PX;
    if (reducedMotion()) this.shown = to;
    else this.startSlide(this.shown, to);
  };

  private startSlide(from: number, to: number) {
    this.stopSlide();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      this.shown = Math.round(from + (to - from) * easeOutCubic(t));
      this.slide = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.slide = requestAnimationFrame(step);
  }

  private stopSlide() {
    if (this.slide !== null) cancelAnimationFrame(this.slide);
    this.slide = null;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.toggleAttribute('collapsed', collapsed);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopSlide();
  }

  protected override updated() {
    this.style.width = `${this.shown}px`;
  }

  override render() {
    return html`
      <div class="content" style="width:${OPEN_PX}px" ?inert=${collapsed}>
        <button class="head" @click=${this.toggle}>
          <h2>${this.heading}</h2>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
        <div class="list"><slot></slot></div>
      </div>
      <button class="rail" ?inert=${!collapsed} @click=${this.toggle}>
        <span aria-hidden="true">‹</span>
        <span class="rail-heading">${this.heading}</span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-side-pane': SidePaneElement;
  }
}
