import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { PendingCite } from '@/client/state';
import { bookKind, entryRoles } from '@/common/books';
import type { PersonRow } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// What an entry of the Volume's Book is called: a baptism or a marriage,
// else an entry.
const ENTRY_NAMES: Partial<Record<string, string>> = {
  kastetut: 'baptism',
  vihityt: 'marriage'
};

function stop(e: Event) {
  e.stopPropagation();
}

// Asked of the layer: someone to name in the Role, or with none in a
// Role-less Book, picked where the press was.
export interface ChooseDetail {
  role: string | null;
  at: { x: number; y: number };
}

// A new Entry's people and words, or the source's being edited, beside
// its pending Box (ADR-0026). In a
// baptism or a marriage a row for each Role, its person or none, each
// chosen (`choose`) or taken out (`drop`); in another Book the people
// named, and _Add person…_. Then what the entry says (`text`). Cancel and
// Save stay in the foot bar. Presses stay here, so they don't pan the
// scan.
@customElement('sl-scan-entry')
class ScanEntryElement extends LitElement {
  static override styles = css`
    :host {
      position: absolute;
      z-index: 2;
      display: grid;
      gap: 0.35rem;
      width: 17rem;
      padding: 0.5rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--card);
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
      pointer-events: auto;
      font-size: 0.9rem;
    }

    h3 {
      margin: 0;
      color: var(--muted);
      font-size: 0.8em;
      font-weight: 500;
    }

    .row {
      display: grid;
      grid-template-columns: 4.2rem 1fr auto;
      gap: 0.4rem;
      align-items: center;
    }

    .role {
      color: var(--muted);
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    p.none {
      margin: 0;
      color: var(--muted);
      font-size: 0.85em;
    }

    button {
      padding: 0.1rem 0.45rem;
      font-size: 0.85rem;
    }

    button.choose {
      justify-self: start;
    }

    button.drop {
      border-color: transparent;
      background: none;
      color: var(--muted);
    }

    input {
      width: 100%;
      box-sizing: border-box;
      text-align: left;
    }
  `;

  @property({ attribute: false }) cite!: PendingCite;
  // The Volume's label, whose Book tells the Roles.
  @property() volume = '';
  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  private nameOf(personId: number) {
    const person = this.persons.get(personId);
    return person === undefined ? 'Someone' : formatName(person);
  }

  private choose(e: MouseEvent, role: string | null) {
    const host = this.getBoundingClientRect();
    const box = this.offsetParent?.getBoundingClientRect() ?? host;
    const detail: ChooseDetail = {
      role,
      at: { x: e.clientX - box.left, y: e.clientY - box.top }
    };
    this.dispatchEvent(new CustomEvent('choose', { detail }));
  }

  private drop(personId: number) {
    this.dispatchEvent(new CustomEvent('drop', { detail: { personId } }));
  }

  private renderPerson(personId: number) {
    return html`<span class="name">${this.nameOf(personId)}</span>
      <button
        class="drop"
        aria-label="Take ${this.nameOf(personId)} out"
        @click=${() => {
          this.drop(personId);
        }}
      >
        ×
      </button>`;
  }

  // A row for each Role, its person or a button to choose one.
  private renderRoles(roles: ReturnType<typeof entryRoles>) {
    return roles.map(({ role, label }) => {
      const named = this.cite.people.find((p) => p.role === role);
      return html`<div class="row">
        <span class="role">${label}</span>
        ${
          named === undefined
            ? html`<button
                  class="choose"
                  @click=${(e: MouseEvent) => {
                    this.choose(e, role);
                  }}
                >
                  Choose…
                </button>
                <span></span>`
            : this.renderPerson(named.personId)
        }
      </div>`;
    });
  }

  // The people named, then one more to add.
  private renderPeople() {
    return html`${this.cite.people.map(
        (p) =>
          html`<div class="row">
            <span class="role">Person</span>${this.renderPerson(p.personId)}
          </div>`
      )}
      <div class="row">
        <span></span>
        <button
          class="choose"
          @click=${(e: MouseEvent) => {
            this.choose(e, null);
          }}
        >
          Add person…
        </button>
      </div>`;
  }

  override render() {
    const roles = entryRoles(this.volume);
    return html`
      <h3>
        ${this.cite.editing === undefined ? 'New' : 'Edit'}
        ${ENTRY_NAMES[bookKind(this.volume) ?? ''] ?? 'entry'}
      </h3>
      ${roles.length === 0 ? this.renderPeople() : this.renderRoles(roles)}
      <input
        type="text"
        placeholder="What the entry says, e.g. Baptism 12.3.1795"
        aria-label="What the entry says"
        .value=${this.cite.text}
        @input=${(e: InputEvent) => {
          const { value } = e.target as HTMLInputElement;
          this.dispatchEvent(new CustomEvent('text', { detail: value }));
        }}
      />
      ${
        this.cite.people.length === 0
          ? html`<p class="none">Name someone in it.</p>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-entry': ScanEntryElement;
  }
}
