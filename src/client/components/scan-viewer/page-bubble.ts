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

// The page the Image is counted as (ADR-0032), where Settings asks for
// it: a see-through bubble over the scan's top left corner, where the page
// number is written. Read there, by the vision model (tagged AI) or set by
// hand, or counted (≈) from the Page pins around it, or the book's
// numbering without any. Clicked, it takes the page written there, or a spread's
// two ("4-5"), or nothing for an Image without a page number, left out
// of the counting: Enter sets them by hand, which the estimates around it
// count from. Escape, or clicking elsewhere, leaves it as it was. A page
// read or set here has a × beside it that takes it away, the Image then
// counted; a later survey may read it again. A Volume whose page numbers
// are marked checked shows them locked, and nothing on an Image left out
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

  private renderShown({ pages, by }: ImagePages) {
    const locked = this.state.viewer.pages.locked.get();
    if (locked && pages.length === 0) return nothing;
    const named =
      pages.length === 0
        ? 'skipped'
        : pages.length === 1
          ? `page ${pages[0]}`
          : `pages ${pages[0]}–${pages.at(-1)}`;
    if (locked) {
      return html`<span
        class="bubble locked"
        title="This Volume's page numbers are marked checked. Unmark them from the menu to change them"
        >${named}</span
      >`;
    }
    return html`<button
      class=${by === null ? 'bubble counted' : 'bubble'}
      title=${
        by === null
          ? 'Counted, not read here. Click to set the page written on this Image'
          : `${HOW[by]}. Click to correct it`
      }
      @click=${() => {
        this.editing = true;
      }}
    >
      ${by === null ? `≈ ${named}` : named}
      ${by === 'vision' ? html`<span class="ai">AI</span>` : nothing}
    </button>`;
  }

  private renderRemove() {
    return html`<button
      class="bubble remove"
      title="Take away this page; the Image is then counted"
      aria-label="Take away this page"
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
      // A counted Image may have more pages placed on it than are written
      // there: its first is typed, the Volume's pace giving the rest.
      const typed = here.by === null ? here.pages.slice(0, 1) : here.pages;
      return html`${this.renderEditing(typed)}
      ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}`;
    }
    const locked = this.state.viewer.pages.locked.get();
    return html`${this.renderShown(here)}
    ${here.by === null || locked ? nothing : this.renderRemove()}
    ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-page': ScanPageElement;
  }
}
