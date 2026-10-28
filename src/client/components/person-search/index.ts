import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import type { PersonRow } from '@/common/types';

import type { Point } from '../tree-view/emit';
import { formatDates, formatName } from '../tree-view/renderer';

const MIN_LEN = 2;
const MAX_RESULTS = 50;
const PAGE_STEP = 10;

export type PickEvent = CustomEvent<{ id: number }>;

// Find-person combobox. Focus stays in the input while the arrow keys move the
// highlighted result (aria-activedescendant), so typing is never interrupted;
// Enter or a click fires `pick` with the person's id and clears the query.
@customElement('sl-person-search')
class PersonSearchElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: block;
        position: relative;
      }

      /* Same height and frame as the Settings gear beside it, so the pair
       reads as one quiet cluster rather than a form field. */
      input {
        -webkit-user-select: text;
        width: 100%;
        height: 2rem;
        box-sizing: border-box;
        padding: 0 0.6rem 0 1.85rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        color: var(--muted);
        font: inherit;
        font-size: 0.875rem;
        appearance: none;
      }

      input::placeholder {
        color: var(--muted);
      }

      input:focus {
        outline: none;
        border-color: var(--accent);
        color: var(--fg);
      }

      .icon {
        position: absolute;
        top: 50%;
        left: 0.6rem;
        width: 0.875rem;
        height: 0.875rem;
        transform: translateY(-50%);
        color: var(--muted);
        pointer-events: none;
      }

      .results {
        position: absolute;
        top: calc(100% + 2px);
        left: 0;
        width: 100%;
        max-height: 320px;
        overflow-y: auto;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 6px;
        box-shadow: 0 4px 12px var(--shadow);
        z-index: 20;
      }

      .results button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0.4rem 0.6rem;
        background: transparent;
        color: var(--fg);
        border: 0;
        border-bottom: 1px solid var(--border);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
      }

      .results button[aria-selected='true'] {
        background: color-mix(in srgb, var(--accent) 18%, transparent);
      }

      .meta {
        color: var(--muted);
        font-size: 0.85em;
        margin-left: 0.4em;
      }
    `
  ];

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  @state() private query = '';
  // Resets to the top match on every query change so Enter picks the best hit.
  @state() private active = 0;

  private results() {
    const q = this.query.trim().toLowerCase();
    if (q.length < MIN_LEN) return [];
    const out: PersonRow[] = [];
    for (const p of this.persons.values()) {
      const key = `${p.given ?? ''} ${p.surname ?? ''}`.toLowerCase();
      if (key.includes(q)) {
        out.push(p);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }

  // WebKit fires a mousemove when the list scrolls under a resting pointer, so
  // hover only takes the highlight once the pointer has actually moved — else
  // arrowing past the fold snaps back to whatever row is under the mouse.
  private pointer: Point = { x: NaN, y: NaN };

  private hover(e: MouseEvent, i: number) {
    if (e.clientX === this.pointer.x && e.clientY === this.pointer.y) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.active = i;
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onDocumentKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onDocumentKeydown);
  }

  // ⌘F (Ctrl+F elsewhere) jumps to the search, in place of the browser's
  // find-in-page, which can't see into the chart's SVG anyway.
  private readonly onDocumentKeydown = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    if (e.key.toLowerCase() !== 'f') return;
    const input = this.renderRoot.querySelector('input');
    if (input === null) return;
    e.preventDefault();
    input.focus();
    input.select();
  };

  // Puts the cursor in the search, as ⌘F does.
  focusInput() {
    this.renderRoot.querySelector('input')?.focus();
  }

  private pick(id: number) {
    this.query = '';
    this.dispatchEvent(new CustomEvent('pick', { detail: { id } }));
  }

  private readonly onInput = (e: InputEvent) => {
    this.query = (e.target as HTMLInputElement).value;
    this.active = 0;
  };

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      if (this.query === '') return;
      e.preventDefault();
      this.query = '';
      return;
    }
    // Let focus move on, but don't leave the list hanging open behind it.
    if (e.key === 'Tab') {
      this.query = '';
      return;
    }
    const results = this.results();
    if (results.length === 0) return;
    const last = results.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        this.active = this.active >= last ? 0 : this.active + 1;
        break;
      case 'ArrowUp':
        this.active = this.active <= 0 ? last : this.active - 1;
        break;
      case 'PageDown':
        this.active = Math.min(this.active + PAGE_STEP, last);
        break;
      case 'PageUp':
        this.active = Math.max(this.active - PAGE_STEP, 0);
        break;
      case 'Enter': {
        const p = results[this.active];
        if (p !== undefined) this.pick(p.id);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  override updated(changed: PropertyValues) {
    if (changed.has('active')) {
      this.renderRoot
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    }
  }

  override render() {
    const results = this.results();
    const open = results.length > 0;
    return html`
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="7"
          cy="7"
          r="4.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <path
          d="M10.5 10.5 14 14"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
      <input
        type="search"
        placeholder="Find person…"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="results"
        aria-expanded=${open ? 'true' : 'false'}
        aria-activedescendant=${open ? `result-${this.active}` : nothing}
        .value=${this.query}
        @input=${this.onInput}
        @keydown=${this.onKeydown}
      />
      ${
        open
          ? html`<div
              class="results"
              id="results"
              role="listbox"
              tabindex="-1"
              @mousedown=${(e: MouseEvent) => {
                // Focus stays in the input, where the arrow keys are handled:
                // clicks here don't take it, and tabindex -1 stops WebKit
                // making the scrolling list a Tab stop.
                e.preventDefault();
              }}
            >
              ${results.map((p, i) => {
                const dates = formatDates(p);
                return html`
                  <button
                    id="result-${i}"
                    role="option"
                    tabindex="-1"
                    aria-selected=${i === this.active ? 'true' : 'false'}
                    @mousemove=${(e: MouseEvent) => {
                      this.hover(e, i);
                    }}
                    @click=${() => {
                      this.pick(p.id);
                    }}
                  >
                    ${formatName(p)}
                    ${
                      dates.length > 0
                        ? html`<span class="meta">(${dates})</span>`
                        : nothing
                    }
                  </button>
                `;
              })}
            </div>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-search': PersonSearchElement;
  }
}
