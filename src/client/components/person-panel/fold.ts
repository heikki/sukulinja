import { css, html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const SLIDE_MS = 200;
// Ease-out cubic, as the dock slides.
const EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// What a chevron shows or hides, its height sliding open and shut. Shut, it
// stays rendered but out of the layout, so it slides shut still showing what
// it showed, and a slide turned back midway starts from where it got to.
@customElement('sl-fold')
class FoldElement extends LitElement {
  // flow-root keeps the content's margins inside whether or not it's
  // clipped, so they don't jump as a slide ends.
  static override styles = css`
    :host {
      display: flow-root;
    }

    :host(:not([open]):not([sliding])) {
      display: none;
    }

    :host([sliding]) {
      overflow: hidden;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;

  private slide: Animation | null = null;
  // The height a slide starts from, taken before `open` changes the layout.
  private from: number | null = null;

  // Resolves once a pending change of `open` has slid into place.
  async settled() {
    await this.updateComplete;
    await this.slide?.finished.catch(() => undefined);
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    const slides = changed.has('open') && this.hasUpdated && !reducedMotion();
    this.from = slides ? this.getBoundingClientRect().height : null;
  }

  protected override updated() {
    const { from } = this;
    if (from === null) return;
    this.slide?.cancel();
    this.toggleAttribute('sliding', true);
    const to = this.open ? this.scrollHeight : 0;
    const slide = this.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: SLIDE_MS, easing: EASING }
    );
    this.slide = slide;
    slide.onfinish = () => {
      this.slide = null;
      this.toggleAttribute('sliding', false);
    };
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- Lit's render hook
  override render() {
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-fold': FoldElement;
  }
}
