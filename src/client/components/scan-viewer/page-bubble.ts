import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { pageNumbersOn } from '@/client/page-numbers-flag';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

function stop(e: Event) {
  e.stopPropagation();
}

const HOW = {
  vision: 'Read on this Image by the vision model',
  hand: 'Set on this Image by hand'
};

// The page the Image is counted as (ADR-0032), where Settings asks for
// it: a see-through bubble over the scan's top left corner, where the page
// number is written. Read there, by the vision model or by hand, or
// counted (≈) from the Page pins around it, or the book's numbering
// without any. Clicked, it takes the page written there: Enter sets it by
// hand, which the estimates around it count from; left empty, it takes a
// page set by hand away. Escape, or clicking elsewhere, leaves it as it
// was. Pointer and wheel input stays here, so a press doesn't pan.
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

    input.bubble {
      width: 7ch;
      outline: none;
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

  private async save(input: HTMLInputElement) {
    const text = input.value.trim();
    const page = text === '' ? null : Number(text);
    if (page !== null && !(Number.isInteger(page) && page > 0)) {
      this.refused = 'A page is a whole number.';
      return;
    }
    try {
      await this.state.viewer.setPageHere(page);
      this.editing = false;
      this.refused = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    }
  }

  private renderEditing(first: number) {
    return html`<input
      class="bubble"
      type="text"
      inputmode="numeric"
      aria-label="Page"
      .value=${String(first)}
      @keydown=${(e: KeyboardEvent) => {
        const input = e.target as HTMLInputElement;
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.editing = false;
          this.refused = null;
        } else if (e.key === 'Enter') {
          void this.save(input);
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

  override render() {
    const here = pageNumbersOn.get() ? this.state.viewer.pagesHere.get() : null;
    if (here === null) return nothing;
    const { pages, by } = here;
    const named =
      pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join('–')}`;
    return html`
      ${
        this.editing
          ? this.renderEditing(pages[0]!)
          : html`<button
              class="bubble"
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
            </button>`
      }
      ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-page': ScanPageElement;
  }
}
