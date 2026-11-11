import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import { typing } from '@/client/typing';
import type { ChurchBookArchive } from '@/common/types';

import { findArchives } from './api';

// How long typing pauses before Astia's list is looked through.
const PAUSE_MS = 300;

export type ArchiveChosenEvent = CustomEvent<ChurchBookArchive>;

// Finding a parish's archive in Astia: a name, `name` to start with, and
// the parish archives whose titles start most like it. Choosing one says
// so (`archive-chosen`); Cancel says `cancel`. While `busy`, nothing can
// be chosen; `error` says why the last choice failed.
@customElement('sl-archive-search')
class ArchiveSearchElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: block;
      }

      input {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg);
        color: var(--fg);
        font: inherit;
        font-size: 0.9rem;
      }

      ul {
        margin: 0.35rem 0 0;
        padding: 0;
        list-style: none;
      }

      button {
        font: inherit;
        cursor: pointer;
      }

      li button {
        display: block;
        width: 100%;
        padding: 0.3rem 0.5rem;
        border: 0;
        border-radius: 6px;
        background: none;
        color: var(--fg);
        font-size: 0.9rem;
        text-align: left;
      }

      li button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--fg) 8%, transparent);
      }

      li button:disabled {
        cursor: default;
        opacity: 0.55;
      }

      p {
        margin: 0.35rem 0 0;
        color: var(--muted);
        font-size: 0.85rem;
      }

      p.error {
        color: var(--danger);
      }

      .end {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.25rem;
      }

      .end button {
        padding: 0.15rem 0.5rem;
        border: 0;
        background: none;
        color: var(--muted);
        font-size: 0.85rem;
      }

      .end button:hover {
        color: var(--accent);
      }
    `
  ];

  @property() name = '';

  @property() label = 'Parish';

  @property({ type: Boolean }) busy = false;

  @property() error: string | null = null;

  // The archives found for what's typed; null while looking.
  @state() private found: ChurchBookArchive[] | 'failed' | null = null;

  private typed = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private asking: AbortController | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.typed = this.name;
    void this.look();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer !== null) clearTimeout(this.timer);
    this.asking?.abort();
  }

  override firstUpdated() {
    const input = this.renderRoot.querySelector('input');
    input?.focus();
    input?.select();
  }

  private async look() {
    this.asking?.abort();
    const asking = new AbortController();
    this.asking = asking;
    if (this.typed.trim() === '') {
      this.found = [];
      return;
    }
    this.found = null;
    try {
      const found = await findArchives(this.typed, asking.signal);
      if (this.asking === asking) this.found = found;
    } catch {
      if (this.asking === asking) this.found = 'failed';
    }
  }

  private readonly onInput = (e: Event) => {
    this.typed = (e.target as HTMLInputElement).value;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.look();
    }, PAUSE_MS);
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.cancel();
    } else if (typing(e)) {
      e.stopPropagation();
    }
  };

  private cancel() {
    this.dispatchEvent(new CustomEvent('cancel'));
  }

  private choose(archive: ChurchBookArchive) {
    this.dispatchEvent(new CustomEvent('archive-chosen', { detail: archive }));
  }

  private renderFound() {
    const { found } = this;
    if (found === null) return html`<p>Looking in Astia…</p>`;
    if (found === 'failed') {
      return html`<p>Astia couldn't be reached. Try again later.</p>`;
    }
    if (this.typed.trim() === '') return nothing;
    if (found.length === 0) {
      return html`<p>Astia has no parish archive by that name.</p>`;
    }
    return html`<ul>
      ${found.map(
        (a) =>
          html`<li>
            <button
              ?disabled=${this.busy}
              @click=${() => {
                this.choose(a);
              }}
            >
              ${a.title}
            </button>
          </li>`
      )}
    </ul>`;
  }

  override render() {
    return html`
      <input
        type="search"
        aria-label=${this.label}
        placeholder="Parish name"
        .value=${this.name}
        @input=${this.onInput}
        @keydown=${this.onKeyDown}
      />
      ${this.renderFound()}
      ${
        this.error === null ? nothing : html`<p class="error">${this.error}</p>`
      }
      <div class="end">
        <button
          @click=${() => {
            this.cancel();
          }}
        >
          Cancel
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-archive-search': ArchiveSearchElement;
  }
  interface HTMLElementEventMap {
    'archive-chosen': ArchiveChosenEvent;
  }
}
