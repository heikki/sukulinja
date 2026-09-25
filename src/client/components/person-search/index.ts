import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { PersonRow } from '@common/types';

import { formatDates, formatName } from '../tree-view/renderer';

const MIN_LEN = 2;
const MAX_RESULTS = 50;
const PAGE_STEP = 10;

export type PickEvent = CustomEvent<{ id: number }>;

// Find-person combobox. Focus stays in the input while the arrow keys move the
// highlighted result (aria-activedescendant), so typing is never interrupted;
// Enter or a click fires `pick` with the person's id and clears the query.
@customElement('sl-person-search')
export class PersonSearchElement extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: relative;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      font: inherit;
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
  `;

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
          ? html`<div class="results" id="results" role="listbox">
              ${results.map((p, i) => {
                const dates = formatDates(p);
                return html`
                  <button
                    id="result-${i}"
                    role="option"
                    tabindex="-1"
                    aria-selected=${i === this.active ? 'true' : 'false'}
                    @mousemove=${() => {
                      this.active = i;
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
