import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { boxOn } from '@/client/state/places';

import { formatName } from '../tree-view/renderer';
import { scanPaneStyles } from './edit-styles';
import { sourceName } from './menu';

import './edit';

function stop(e: Event) {
  e.stopPropagation();
}

function renderRow(label: string, text: string | null) {
  return text === null
    ? nothing
    : html`<div class="row">
        <span class="role">${label}</span><span>${text}</span>
      </div>`;
}

// The source's own Box being placed or moved, in a pane beside the scan in
// place of People here, as a new Entry's is (entry-form.ts): whose it is
// and what it cites, then Cancel and Save (edit.ts). The Box itself is
// moved and resized over the scan.
@customElement('sl-scan-box')
class ScanBoxElement extends SignalWatcher(LitElement) {
  static override styles = [
    scanPaneStyles,
    css`
      .row {
        display: grid;
        grid-template-columns: 6.5rem 1fr;
        gap: 0.75rem;
      }

      .role,
      .hint {
        color: var(--muted);
      }

      .hint {
        margin: 0;
        font-size: 0.85em;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  // Moving the Box it has on the Image shown, else placing one here.
  private heading() {
    const { viewer } = this.state;
    const link = viewer.source.get()?.link;
    const volume = viewer.volume.get();
    if (link?.precision !== 'entry' || volume === null) {
      return 'Place entry';
    }
    const on = { volumeId: volume.id, image: viewer.image.get() };
    return boxOn(link, on) === null ? 'Place entry' : 'Edit box';
  }

  private personName() {
    const id = this.state.selected.id.get();
    const person =
      id === null ? undefined : this.state.chart.people.get().persons.get(id);
    return person === undefined ? null : formatName(person);
  }

  override render() {
    const pending = this.state.viewer.pending.get();
    if (pending?.kind !== 'mark') return nothing;
    return html`
      <h2>${this.heading()}</h2>
      <div class="body">
        ${renderRow('Person', this.personName())}
        ${renderRow('Source', sourceName(this.state.viewer))}
        <p class="hint">Drag the box or its corners to fit the entry.</p>
        <sl-scan-edit></sl-scan-edit>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-box': ScanBoxElement;
  }
}
