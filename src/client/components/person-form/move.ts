import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { placedInside } from '../context-menu';
import { formatName } from '../tree-view/renderer';
import { moveChoices } from './moves';
import type { Moving } from './moves';

import '../person-search/index';

function stop(e: Event) {
  e.stopPropagation();
}

// Moving the person out of a family, `moving` says which and as what, at
// `at` where the card's menu was: the search picks the new parent or
// spouse, then which of their families, or a new one; Move moves them in
// one go. Cancel, Esc or a press elsewhere say `closed`, as Move does once
// done. Presses on it stay on it, so they don't pan the chart.
@customElement('sl-move-form')
class MoveFormElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    css`
      :host {
        position: absolute;
        z-index: 3;
        width: 20rem;
        box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
        border-radius: 8px;
        font-size: 0.875rem;
        line-height: 1.4;
        cursor: auto;
      }

      .form {
        background: var(--card);
      }

      h3 {
        margin: 0 0 0.2rem;
        overflow: hidden;
        color: var(--muted);
        font-size: 0.8em;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .picked {
        margin: 0;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) personId = 0;
  @property({ attribute: false }) moving: Moving | null = null;
  @property({ attribute: false }) heading = '';
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };

  // The new parent or spouse, once picked, and which of the places with
  // them.
  @state() private otherId: number | null = null;
  @state() private choice = 0;
  @state() private saving = false;
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    window.addEventListener('mousedown', this.onOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
  }

  override firstUpdated() {
    const search = this.renderRoot.querySelector('sl-person-search');
    void search?.updateComplete.then(() => {
      search.focusInput();
    });
  }

  override updated() {
    const { x, y } = placedInside(this, this.at);
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
  }

  private readonly onOutside = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) this.close();
  };

  private close() {
    this.dispatchEvent(new Event('closed'));
  }

  private choices() {
    const { otherId, moving } = this;
    if (otherId === null || moving === null) return [];
    return moveChoices(otherId, moving, this.state.chart.people.get());
  }

  private async save() {
    const chosen = this.choices()[this.choice];
    if (this.saving || chosen === undefined || this.moving === null) return;
    this.saving = true;
    this.refused = null;
    try {
      await this.state.personEdits.move(
        this.personId,
        this.moving.from,
        chosen.to
      );
      this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
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
    return html`<div class="form" role="dialog" @keydown=${this.onKeyDown}>
      <h3>${this.heading}</h3>
      ${otherId === null ? this.renderSearch() : this.renderPicked(otherId)}
      ${
        this.refused === null
          ? nothing
          : html`<p class="error">${this.refused}</p>`
      }
      <div class="buttons">
        <span class="gap"></span>
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.close();
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.saving || otherId === null}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.saving ? 'Moving…' : 'Move'}
        </button>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-move-form': MoveFormElement;
  }
}
