import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { selectStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type { AppState, PendingCite } from '@/client/state';
import type { Lock } from '@/client/state/pending-entry';
import { boxOn } from '@/client/state/places';
import {
  ENTRY_EVENTS,
  eventLabel,
  eventRoles,
  isEntryEvent
} from '@/common/entry-events';
import type { EntryEvent, EntryRole } from '@/common/entry-events';
import { ownerRoles } from '@/common/entry-lock';
import { differenceWords, treeDifferences } from '@/common/entry-tree';

import { buttonStyles } from '../box-stage/styles';
import { formatName } from '../tree-view/renderer';
import { parentRows, treeOf, withEvent } from './cite';
import type { ParentRow } from './cite';
import { scanPaneStyles } from './edit-styles';
import type { FieldDetail, TickDetail } from './entry-fields';

import './edit';
import './entry-fields';

function stop(e: Event) {
  e.stopPropagation();
}

// The Change… of a kind or owner shown as saved (ADR-0037).
function changeButton(what: string, onPress: (e: MouseEvent) => void) {
  return html`<button
    class="change"
    aria-label="Change ${what}"
    @click=${onPress}
  >
    Change…
  </button>`;
}

// Asked of the viewer: someone to name in the Role, or with none in an
// Entry with no Roles, picked where the press was, in the window.
export interface ChooseDetail {
  role: string | null;
  at: { x: number; y: number };
}

// A new Entry's kind and people, the source's being edited, or a
// Church-book reference's being placed, which its Mark makes an Entry
// (pending-change.ts), in a pane beside the scan in place of People here
// while its Box is pending (ADR-0026), so the scan stays in view. First what it records, its
// Event; then in a baptism or a marriage a row for each Role, its person
// or none, each chosen (`choose`, picked over the scan) or taken out; in
// a burial or a household line its one person; then its fields and what
// they'd do to the tree (entry-fields.ts), among them what it says, its
// text, also changed in the person's sources (source-text.ts). Cancel and
// Save under them (edit.ts). It can't be hidden while the Box is pending.
@customElement('sl-scan-entry')
class ScanEntryElement extends SignalWatcher(LitElement) {
  static override styles = [
    scanPaneStyles,
    buttonStyles,
    css`
      .row.top {
        align-items: start;
      }

      /* Each parent's name and ×, in line with the child's. */
      .parents {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-column: 2 / span 2;
        gap: 0.2rem 0.5rem;
        align-items: center;
      }

      .parents .none {
        grid-column: 1 / -1;
      }

      .row {
        display: grid;
        grid-template-columns: 4.75rem 1fr auto;
        gap: 0.5rem;
        align-items: center;
      }

      .role {
        color: var(--muted);
      }

      /* Its text in line with the fields', past their border and padding. */
      .name {
        padding-left: calc(0.5rem + 1px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .differs {
        margin: 0;
        color: var(--caution);
        font-size: 0.85em;
      }

      .none {
        margin: 0;
        color: var(--muted);
        font-size: 0.85em;
      }

      button.choose {
        justify-self: start;
      }

      button.drop {
        border-color: transparent;
        background: none;
        color: var(--muted);
      }

      button.change {
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
      }

      button.change:hover {
        text-decoration: underline;
      }

      /* Its label over it, the pane's width. */
      label.text {
        display: grid;
        gap: 0.3rem;
      }

      textarea {
        min-width: 0;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        color: var(--fg);
        font: inherit;
        line-height: 1.35;
        resize: none;
        overflow: auto hidden;
        white-space: pre;
      }

      select {
        grid-column: 2 / span 2;
        min-width: 0;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        color: var(--fg);
        font: inherit;
      }
    `,
    // After the select's own padding, so the chevron keeps its room.
    selectStyles
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private get viewer() {
    return this.state.viewer;
  }

  // The pending Entry as drawn now, set as each render starts.
  private shown!: PendingCite;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  // Their name as the tree writes it; someone new's as typed.
  private nameOf(personId: number) {
    const fresh = this.shown.newcomers.find((n) => n.personId === personId);
    if (fresh !== undefined) {
      const { given, surname } = fresh.name;
      const name = `${given.trim()} ${surname.trim()}`.trim();
      return `${name === '' ? 'Someone' : name} (new)`;
    }
    const person = this.state.chart.people.get().persons.get(personId);
    return person === undefined ? 'Someone' : formatName(person);
  }

  private choose(e: MouseEvent, role: string | null) {
    const detail: ChooseDetail = { role, at: { x: e.clientX, y: e.clientY } };
    this.dispatchEvent(
      new CustomEvent('choose', { detail, bubbles: true, composed: true })
    );
  }

  private drop(personId: number) {
    this.viewer.entryForm.drop(personId);
  }

  // The Entry edited as saved, if it's one being edited.
  private saved() {
    const pending = this.viewer.pending.get();
    return pending?.kind === 'edit' ? pending.editing : null;
  }

  // Whether what of the Entry edited stays as saved shows so, its
  // Change… not pressed (ADR-0037); an empty kind is chosen as an edit.
  private locked(lock: Lock) {
    const saved = this.saved();
    if (saved === null || this.shown.unlocked?.includes(lock) === true) {
      return false;
    }
    return lock === 'owner' || saved.event !== null;
  }

  // Whom the owner's Role (null: a burial's or household line's one
  // person) named as saved, shown so while it's locked; undefined for
  // none.
  private lockedOwner(role: string | null) {
    const saved = this.saved();
    if (saved === null || !this.locked('owner')) return undefined;
    const roles = ownerRoles({ event: saved.event, people: saved.was });
    return roles.find((r) => r.role === role)?.personId;
  }

  // The owner made to change: the person picker opens for the Role; a
  // one-person entry's person shows to take out, kept until they are.
  private changeOwner(e: MouseEvent, role: string | null) {
    this.viewer.entryForm.unlock('owner');
    if (role !== null) this.choose(e, role);
  }

  // Its person in an owner's Role: as saved, with Change…, while locked.
  private renderOwner(role: string | null, personId: number) {
    if (this.lockedOwner(role) !== personId) return this.renderPerson(personId);
    return html`<span class="name">${this.nameOf(personId)}</span>
      ${changeButton(this.nameOf(personId), (e) => {
        this.changeOwner(e, role);
      })}`;
  }

  // Its Event chosen anew, with whom it names then.
  private chooseEvent(event: EntryEvent, cite: PendingCite) {
    const ix = this.state.chart.people.get();
    this.viewer.entryForm.setEvent(event, withEvent(cite.people, event, ix));
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

  // What it records, to choose; none chosen yet, the Book couldn't tell.
  // Saved, it shows as text with Change… (ADR-0037).
  private renderEvent() {
    const { event } = this.shown;
    if (event !== null && this.locked('kind')) {
      return html`<div class="row">
        <span class="role">Kind</span>
        <span class="name">${eventLabel(event)}</span>
        ${changeButton('kind', () => {
          this.viewer.entryForm.unlock('kind');
        })}
      </div>`;
    }
    return html`${this.renderEventSelect()}`;
  }

  private renderEventSelect() {
    const { event } = this.shown;
    return html`<div class="row">
      <span class="role">Kind</span>
      <select
        aria-label="Kind of entry"
        @change=${(e: Event) => {
          const { value } = e.target as HTMLSelectElement;
          if (!isEntryEvent(value)) return;
          this.chooseEvent(value, this.shown);
        }}
      >
        ${event === null ? html`<option selected>Choose…</option>` : nothing}
        ${ENTRY_EVENTS.map(
          (e) =>
            html`<option value=${e.event} ?selected=${e.event === event}>
              ${e.label}
            </option>`
        )}
      </select>
    </div>`;
  }

  // A row for each Role, its person or a button to choose one.
  private renderRoles(roles: readonly EntryRole[]) {
    return roles.map(({ role, label }) => {
      const named = this.shown.people.find((p) => p.role === role);
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
            : this.renderOwner(role, named.personId)
        }
      </div>`;
    });
  }

  // A baptism: its child, chosen or taken out, then the child's parents in
  // the tree: each named, to take out (`drop`), or one to add, chosen
  // over the scan (`choose`).
  private renderBaptism() {
    const child = this.shown.people.find((p) => p.role === 'CHIL');
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
            : this.renderOwner('CHIL', child.personId)
        }
      </div>

      <div class="row top">
        <span class="role">Parents</span>
        <div class="parents">
          ${
            child === undefined
              ? html`<span class="none">Choose the child first.</span>`
              : parentRows(
                  this.shown.people,
                  this.state.chart.people.get()
                ).map((p) => this.renderParent(p))
          }
        </div>
      </div>
      ${this.renderUnplaced(eventRoles('CHR'))}`;
  }

  // Those named in it in none of its Roles, as the tree couldn't place.
  private renderUnplaced(roles: readonly EntryRole[]) {
    const known = new Set(roles.map((r) => r.role));
    return this.shown.people
      .filter((p) => p.role === null || !known.has(p.role))
      .map(
        (p) =>
          html`<div class="row">
            <span class="role">Also</span>${this.renderPerson(p.personId)}
          </div>`
      );
  }

  // A parent named, to take out, or one to add, chosen over the scan.
  private renderParent({ role, personId, named }: ParentRow) {
    if (personId !== null && named) return this.renderPerson(personId);
    return html`<button
        class="choose"
        @click=${(e: MouseEvent) => {
          this.choose(e, role);
        }}
      >
        Add ${role === 'FATH' ? 'father' : 'mother'}…
      </button>
      <span></span>`;
  }

  // Its one person, or a button to choose them. One made before naming
  // more shows them all.
  private renderOnePerson() {
    const { people } = this.shown;
    if (people.length > 0) {
      return html`${people.map(
        (p) =>
          html`<div class="row">
            <span class="role">Person</span
            >${this.renderOwner(null, p.personId)}
          </div>`
      )}`;
    }
    return html`<div class="row">
      <span class="role">Person</span>
      <button
        class="choose"
        @click=${(e: MouseEvent) => {
          this.choose(e, null);
        }}
      >
        Choose…
      </button>
      <span></span>
    </div>`;
  }

  private renderPeople() {
    const { event } = this.shown;
    if (event === 'CHR') return this.renderBaptism();
    const roles = eventRoles(event);
    if (roles.length === 0) return this.renderOnePerson();
    return html`${this.renderRoles(roles)}${this.renderUnplaced(roles)}`;
  }

  // Where the Entry edited and the tree differ, as the tree changed under
  // it (ADR-0037): said, not put right, as the app can't tell which was
  // taken wrongly.
  private renderDifferences() {
    if (this.saved() === null) return nothing;
    const tree = treeOf(this.state.chart.people.get());
    const said = treeDifferences(this.shown, tree);
    return said.map(
      (d) =>
        html`<p class="differs">
          ${differenceWords(d, (id) => this.nameOf(id))}
        </p>`
    );
  }

  // What Save does: a reference placed is edited where its Box is on the
  // Image already, confirmed where Vision Match's is.
  private heading(kind: 'place' | 'new' | 'edit') {
    if (kind === 'new') return 'New entry';
    if (kind === 'edit') return 'Edit entry';
    const link = this.viewer.source.get()?.link;
    const volume = this.viewer.volume.get();
    if (link?.precision !== 'entry' || volume === null) return 'Place entry';
    const on = { volumeId: volume.id, image: this.viewer.image.get() };
    if (boxOn(link, on) === null) return 'Place entry';
    return link.certainty === 'match' ? 'Confirm match' : 'Edit entry';
  }

  // What it says, its Transcription, to read and change: as tall as what
  // it says, four rows at least, its lines unwrapped and scrolled across.
  private renderText(text: string) {
    return html`<label class="text">
      <span class="role">Text</span>
      <textarea
        rows="4"
        wrap="off"
        .value=${text}
        placeholder="What the entry says"
        @input=${(e: Event) => {
          this.viewer.entryForm.setText(
            (e.target as HTMLTextAreaElement).value
          );
        }}
      ></textarea>
    </label>`;
  }

  // The text's field grown or shrunk to what it says, past its border and
  // any scrollbar, once the fields it's slotted in have rendered.
  protected override updated() {
    const fields = this.renderRoot.querySelector('sl-entry-fields');
    void (fields?.updateComplete ?? Promise.resolve()).then(() => {
      this.fitText();
    });
  }

  private fitText() {
    const area = this.renderRoot.querySelector('textarea');
    if (area === null) return;
    area.style.height = 'auto';
    const border = area.offsetHeight - area.clientHeight;
    area.style.height = `${area.scrollHeight + border}px`;
  }

  override render() {
    const pending = this.viewer.pending.get();
    if (pending === null) return nothing;
    const cite = pending.cite;
    this.shown = cite;
    return html`
      <h2>${this.heading(pending.kind)}</h2>
      <div class="body">
        ${this.renderEvent()} ${this.renderPeople()} ${this.renderDifferences()}
        ${
          cite.event === null
            ? this.renderText(cite.text)
            : html`<sl-entry-fields
                .event=${cite.event}
                .fields=${cite.fields}
                .ticks=${cite.ticks}
                .offers=${this.viewer.entryForm.offers.get()}
                @set-field=${(e: CustomEvent<FieldDetail>) => {
                  this.viewer.entryForm.setField(e.detail.key, e.detail.text);
                }}
                @tick=${(e: CustomEvent<TickDetail>) => {
                  this.viewer.entryForm.setTick(e.detail.key, e.detail.on);
                }}
              >
                ${this.renderText(cite.text)}
              </sl-entry-fields>`
        }
        ${
          cite.event === null
            ? html`<p class="none">Choose what kind of entry it is.</p>`
            : cite.people.length === 0
              ? html`<p class="none">Name someone in it.</p>`
              : nothing
        }
        <sl-scan-edit></sl-scan-edit>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-entry': ScanEntryElement;
  }
}
