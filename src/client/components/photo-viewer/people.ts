import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PhotoPerson } from '@/common/types';

import { controlStyles, paneRowsStyles } from '../box-stage/styles';
import { formatDates, formatName } from '../tree-view/renderer';

import '../box-stage/side-pane';

// Beside the Photo: the people it's linked to, as the import lists them.
// Clicking one selects them, and the Selected person is marked. Hovering a
// row of someone with a Box names their key with `box-hover`, and the row
// of the Box hovered on the Photo (`hovered`) is highlighted.
@customElement('sl-photo-people')
class PhotoPeopleElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    paneRowsStyles,
    css`
      :host {
        display: contents;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) people: PhotoPerson[] = [];
  @property({ attribute: false }) hovered: string | null = null;

  private hover(key: string | null) {
    this.dispatchEvent(new CustomEvent('box-hover', { detail: key }));
  }

  private renderRow({ personId, box }: PhotoPerson) {
    const person = this.state.chart.people.get().persons.get(personId);
    if (person === undefined) return nothing;
    const current = personId === this.state.selected.id.get();
    const key = box === null ? null : String(personId);
    const hovered = key !== null && key === this.hovered;
    const dates = formatDates(person);
    return html`
      <li>
        <button
          class="row ${current ? 'current' : ''} ${hovered ? 'hovered' : ''}"
          aria-current=${current ? 'true' : nothing}
          @click=${() => {
            this.state.chart.select(personId);
          }}
          @mouseenter=${() => {
            if (key !== null) this.hover(key);
          }}
          @mouseleave=${() => {
            if (key !== null) this.hover(null);
          }}
        >
          <span class="name">${formatName(person)}</span>${
            dates === '' ? nothing : html`<span class="dates">(${dates})</span>`
          }
        </button>
      </li>
    `;
  }

  override render() {
    return html`<sl-side-pane heading="People here">
      <ul>
        ${this.people.map((p) => this.renderRow(p))}
      </ul>
    </sl-side-pane>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photo-people': PhotoPeopleElement;
  }
}
