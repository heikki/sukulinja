import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { pageNumbersOn } from '@/client/page-numbers-flag';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ImagePages } from '@/common/types';

import { typedPages } from './typed-pages';

function stop(e: Event) {
  e.stopPropagation();
}

const HOW = {
  vision: 'Read on this Image by the vision model',
  hand: 'Set on this Image by hand'
};

// What the bubble says of the Image's pages.
function nameOf({ pages, skipped }: ImagePages) {
  if (pages.length === 1) return `page ${pages[0]}`;
  if (pages.length > 1) return `pages ${pages[0]}–${pages.at(-1)}`;
  return skipped === undefined
    ? 'skipped'
    : `skipped · images ${skipped.from}–${skipped.to}`;
}

function titleOf({ by, skipped }: ImagePages) {
  if (by !== null) return `${HOW[by]}. Click to correct it`;
  return skipped === undefined
    ? 'Counted, not read here. Click to set the page written on this Image'
    : `Skipped between Images ${skipped.from} and ${skipped.to}, set to have no page. Click to set the page written on this Image, the rest still skipped`;
}

// The page the Image is counted as (ADR-0032), where Settings asks for
// it: a see-through bubble over the scan's top left corner, where the
// page number is written. Read there, by the vision model (tagged AI) or
// set by hand, or counted (≈) from the Page pins around it, or the book's
// numbering without any. Clicked, it takes the page written there, or a
// spread's two ("4-5"), or nothing for an Image without a page number,
// left out of the counting, and with a skip before or after it, if no pin
// is between, the Images between, the run shown as "skipped · images
// 12–40" at its two ends and "≈ skipped · images 12–40" between; a page
// set in a run splits it. Enter sets them by hand, which the estimates
// around it count from. Escape, or clicking elsewhere, leaves it as it
// was. A page read or set here has a × beside it that takes it away, the
// Image then counted; a later survey may read it again. A Volume whose
// page numbers are marked checked shows them locked, and nothing on an
// Image left out
// of the counting. Pointer and wheel input
// stays here, so a press doesn't pan.
@customElement('sl-scan-page')
class ScanPageElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      top: 0.75rem;
      left: 0.75rem;
      z-index: 2;
    }

    .bubble {
      padding: 0.3rem 0.7rem;
      border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--card) 55%, transparent);
      backdrop-filter: blur(6px);
      color: var(--fg);
      font: inherit;
      font-variant-numeric: tabular-nums;
      cursor: text;
    }

    /* Counted from the pins around it, not read here: dimmer. */
    .bubble.counted {
      color: color-mix(in srgb, var(--muted) 75%, transparent);
    }

    /* Marked checked: shown, not changed. */
    .bubble.locked {
      cursor: default;
    }

    input.bubble {
      width: 9ch;
      outline: none;
    }

    /* Read by the vision model: a small tag, set apart from a page set by
       hand. */
    .ai {
      margin-left: 0.35rem;
      padding: 0 0.3rem;
      border-radius: 4px;
      background: color-mix(in srgb, var(--accent) 30%, transparent);
      font-size: 0.7em;
      font-weight: 600;
      vertical-align: 0.1em;
    }

    .remove {
      margin-left: 0.25rem;
      padding: 0.3rem 0.55rem;
      color: var(--muted);
      cursor: pointer;
    }

    .remove:hover {
      color: var(--fg);
    }

    .refused {
      margin: 0.35rem 0 0;
      color: var(--danger);
      font-size: 0.8rem;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private editing = false;
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  private async save(pages: number[] | null) {
    try {
      await this.state.viewer.pages.setHere(pages);
      this.editing = false;
      this.refused = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    }
  }

  private renderEditing(pages: number[]) {
    return html`<input
      class="bubble"
      type="text"
      aria-label="Page"
      .value=${pages.join('-')}
      @keydown=${(e: KeyboardEvent) => {
        const input = e.target as HTMLInputElement;
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.editing = false;
          this.refused = null;
        } else if (e.key === 'Enter') {
          const pages = typedPages(input.value);
          if (pages === null) {
            this.refused = 'A page, a spread’s two such as 4-5, or none.';
          } else {
            void this.save(pages);
          }
        } else {
          return;
        }
        e.preventDefault();
      }}
      @blur=${() => {
        this.editing = false;
        this.refused = null;
      }}
    />`;
  }

  override updated() {
    if (!this.editing) return;
    const input = this.renderRoot.querySelector('input');
    if (input !== null && this.shadowRoot?.activeElement !== input) {
      input.focus();
      input.select();
    }
  }

  private renderShown(here: ImagePages) {
    const { pages, by } = here;
    const locked = this.state.viewer.pages.locked.get();
    if (locked && pages.length === 0) return nothing;
    const named = nameOf(here);
    if (locked) {
      return html`<span
        class="bubble locked"
        title="This Volume's page numbers are marked checked. Unmark them from the menu to change them"
        >${named}</span
      >`;
    }
    return html`<button
      class=${by === null ? 'bubble counted' : 'bubble'}
      title=${titleOf(here)}
      @click=${() => {
        this.editing = true;
      }}
    >
      ${by === null ? `≈ ${named}` : named}
      ${by === 'vision' ? html`<span class="ai">AI</span>` : nothing}
    </button>`;
  }

  private renderRemove({ skipped }: ImagePages) {
    const said =
      skipped === undefined
        ? 'Take away this page; the Image is then counted'
        : `Take away this end of the Images ${skipped.from}–${skipped.to} skipped; those between are then counted, unless it joins another skip`;
    return html`<button
      class="bubble remove"
      title=${said}
      aria-label=${
        skipped === undefined ? 'Take away this page' : 'Take away this skip'
      }
      @click=${() => {
        void this.save(null);
      }}
    >
      ×
    </button>`;
  }

  override render() {
    const here = pageNumbersOn.get()
      ? this.state.viewer.pages.here.get()
      : null;
    if (here === null) return nothing;
    if (this.editing) {
      // The pages it shows, counted or not, so Enter keeps a spread's two.
      return html`${this.renderEditing(here.pages)}
      ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}`;
    }
    const locked = this.state.viewer.pages.locked.get();
    return html`${this.renderShown(here)}
    ${here.by === null || locked ? nothing : this.renderRemove(here)}
    ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-page': ScanPageElement;
  }
}
