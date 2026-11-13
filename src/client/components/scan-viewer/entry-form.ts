import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { InEntry } from '@/client/dataset-api';
import type { PendingCite } from '@/client/state';
import { bookKind, entryRoles } from '@/common/books';
import type { PersonRow } from '@/common/types';

import { formatName } from '../tree-view/renderer';
import type { ParentRow } from './cite';
import { ARROW_AT, placeCard } from './entry-place';
import type { Rect } from './entry-place';

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
// Save stay in the foot bar. It places itself beside its Box (`anchor`,
// on the stage) and inside the stage (entry-place.ts). Presses stay here,
// so they don't pan the scan.
@customElement('sl-scan-entry')
class ScanEntryElement extends LitElement {
  static override styles = css`
    :host::before {
      content: '';
      position: absolute;
      top: calc(var(--arrow, ${ARROW_AT}px) - 6px);
      left: -7px;
      width: 12px;
      height: 12px;
      border-bottom: 1px solid var(--border);
      border-left: 1px solid var(--border);
      background: var(--card);
      transform: rotate(45deg);
    }

    :host([side='left'])::before {
      right: -7px;
      left: auto;
      border: none;
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }

    label.parent {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      min-width: 0;
    }

    .row.top {
      align-items: start;
    }

    .parents {
      display: grid;
      grid-column: 2 / span 2;
      gap: 0.2rem;
    }

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

    .none {
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

    input[type='text'] {
      width: 100%;
      box-sizing: border-box;
      text-align: left;
    }
  `;

  @property({ attribute: false }) cite!: PendingCite;
  // The Volume's label, whose Book tells the Roles.
  @property() volume = '';
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  // The pending Box on the stage.
  @property({ attribute: false }) anchor: Rect = {
    left: 0,
    top: 0,
    width: 0,
    height: 0
  };
  // A baptism's parents, as the tree gives them for its child.
  @property({ attribute: false }) parents: ParentRow[] = [];

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  // Placed once drawn, when its size is known.
  override updated() {
    const stage = this.offsetParent;
    if (stage === null) return;
    const at = placeCard(
      this.anchor,
      { width: this.offsetWidth, height: this.offsetHeight },
      { width: stage.clientWidth, height: stage.clientHeight }
    );
    this.style.left = `${at.left}px`;
    this.style.top = `${at.top}px`;
    this.style.setProperty('--arrow', `${at.arrow}px`);
    this.setAttribute('side', at.side);
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

  // A baptism: its child, chosen or taken out, then the child's parents in
  // the tree, each named in it or not (`name`, `drop`), or with none, one
  // to make (`choose`).
  private renderBaptism() {
    const child = this.cite.people.find((p) => p.role === 'CHIL');
    return html`<div class="row">
        <span class="role">Child</span>
        ${
          child === undefined
            ? html`<button
                  class="choose"
                  @click=${(e: MouseEvent) => {
                    this.choose(e, 'CHIL');
                  }}
                >
                  Choose…
                </button>
                <span></span>`
            : this.renderPerson(child.personId)
        }
      </div>
      <div class="row top">
        <span class="role">Parents</span>
        <div class="parents">
          ${
            child === undefined
              ? html`<span class="none">Choose the child first.</span>`
              : this.parents.map((p) => this.renderParent(p))
          }
        </div>
      </div>
      ${this.renderUnplaced()}`;
  }

  // Those named in it in no Role of a baptism, as the tree couldn't place.
  private renderUnplaced() {
    const roles = new Set(['CHIL', 'FATH', 'MOTH']);
    return this.cite.people
      .filter((p) => p.role === null || !roles.has(p.role))
      .map(
        (p) =>
          html`<div class="row">
            <span class="role">Also</span>${this.renderPerson(p.personId)}
          </div>`
      );
  }

  private renderParent({ role, personId, named }: ParentRow) {
    if (personId === null) {
      return html`<button
        class="choose"
        @click=${(e: MouseEvent) => {
          this.choose(e, role);
        }}
      >
        Add ${role === 'FATH' ? 'father' : 'mother'}…
      </button>`;
    }
    return html`<label class="parent">
      <input
        type="checkbox"
        .checked=${named}
        @change=${(e: Event) => {
          if ((e.target as HTMLInputElement).checked) {
            const detail: InEntry = { personId, role };
            this.dispatchEvent(new CustomEvent('name', { detail }));
          } else this.drop(personId);
        }}
      />
      <span class="name">${this.nameOf(personId)}</span>
    </label>`;
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
      ${
        bookKind(this.volume) === 'kastetut'
          ? this.renderBaptism()
          : roles.length === 0
            ? this.renderPeople()
            : this.renderRoles(roles)
      }
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
