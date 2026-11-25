import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import { formDialog, formDialogStyles } from '@/client/form-dialog';
import { formStyles } from '@/client/form-styles';
import { markModal } from '@/client/modals';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { formatName } from '../tree-view/renderer';
import { moveChoices } from './moves';
import type { Moving } from './moves';

import '../person-search/index';

function stop(e: Event) {
  e.stopPropagation();
}

// Moving the person out of a family, `moving` says which and as what, in
// a modal titled `heading`: the search picks the new parent or
// spouse, then which of their families, or a new one; Move moves them in
// one go. Cancel, Esc or a press on the scrim say `closed`, as Move does
// once done. Presses on it stay on it, so they don't pan the chart.
@customElement('sl-move-form')
class MoveFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    dialogStyles,
    formDialogStyles,
    css`
      .dialog .form p.picked {
        margin: 0;
        color: var(--fg);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) personId = 0;
  @property({ attribute: false }) moving: Moving | null = null;
  @property({ attribute: false }) heading = '';

  // The new parent or spouse, once picked, and which of the places with
  // them.
  @state() private otherId: number | null = null;
  @state() private choice = 0;

  constructor() {
    super();
    markModal(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  override firstUpdated() {
    const search = this.renderRoot.querySelector('sl-person-search');
    void search?.updateComplete.then(() => {
      search.focusInput();
    });
  }

  // Once picked, the search is gone: its family takes the focus, so the
  // form's keys stay its own.
  override updated(changed: Map<string, unknown>) {
    if (changed.has('otherId') && this.otherId !== null) {
      this.renderRoot.querySelector('select')?.focus();
    }
  }

  // Not while saving: a refusal would have nowhere to show.
  private close() {
    if (!this.asking.busy) this.dispatchEvent(new Event('closed'));
  }

  private choices() {
    const { otherId, moving } = this;
    if (otherId === null || moving === null) return [];
    return moveChoices(otherId, moving, this.state.chart.people.get());
  }

  private async save() {
    const chosen = this.choices()[this.choice];
    const { moving } = this;
    if (chosen === undefined || moving === null) return;
    const moved = await this.asking.run(() =>
      this.state.personEdits.move(this.personId, moving.from, chosen.to)
    );
    if (moved) this.close();
  }

  // Esc closes; Enter moves, once someone is picked, but not the Enter
  // that picks them in the search.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    const inSearch = e
      .composedPath()
      .some(
        (el) => el instanceof HTMLElement && el.localName === 'sl-person-search'
      );
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (
      e.key === 'Enter' &&
      this.otherId !== null &&
      !inSearch &&
      !e.isComposing
    ) {
      e.preventDefault();
      void this.save();
    }
  };

  // Everyone but the person, to pick the new parent or spouse from.
  private renderSearch() {
    const persons = new Map(this.state.chart.people.get().persons);
    persons.delete(this.personId);
    return html`<sl-person-search
      .persons=${persons}
      @pick=${(e: CustomEvent<{ id: number }>) => {
        this.otherId = e.detail.id;
        this.choice = 0;
      }}
    ></sl-person-search>`;
  }

  // The one picked, and where with them.
  private renderPicked(otherId: number) {
    const other = this.state.chart.people.get().persons.get(otherId);
    const choices = this.choices();
    return html`<p class="picked">
        ${other === undefined ? '' : formatName(other)}
      </p>
      <label>
        <span>Family</span>
        <select
          @change=${(e: Event) => {
            this.choice = Number((e.target as HTMLSelectElement).value);
          }}
        >
          ${choices.map(
            (c, i) =>
              html`<option value=${i} ?selected=${i === this.choice}>
                ${c.label}
              </option>`
          )}
        </select>
      </label>`;
  }

  override render() {
    const { otherId } = this;
    return formDialog({
      title: this.heading,
      close: () => {
        this.close();
      },
      keydown: this.onKeyDown,
      fields: html`
        ${otherId === null ? this.renderSearch() : this.renderPicked(otherId)}
        ${
          this.asking.refused === null
            ? nothing
            : html`<p class="error">${this.asking.refused}</p>`
        }
      `,
      actions: html`
        <button
          ?disabled=${this.asking.busy}
          @click=${() => {
            this.close();
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.asking.busy || otherId === null}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.asking.busy ? 'Moving…' : 'Move'}
        </button>
      `
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-move-form': MoveFormElement;
  }
}
