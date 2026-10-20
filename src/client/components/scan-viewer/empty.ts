import { SignalWatcher } from '@lit-labs/signals';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { missingText, unlinkedLabel } from '@client/link-labels';
import type { Point } from '@client/pan-zoom';
import type { CitedBook, UnlinkedResolution } from '@common/types';

import { controlStyles, scanEmptyStyles } from './styles';

import './volumes';

// The stage before any Volume is shown, for a source with no Link: what's
// missing, by its parish, Book and years (`cited`), and the parish's Volumes
// to look through for it, from the button or a right-click. Choosing one
// shows it in place of this.
@customElement('sl-scan-empty')
export class ScanEmptyElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanEmptyStyles];

  @property({ attribute: false }) unlinked!: UnlinkedResolution;
  @property({ attribute: false }) cited: CitedBook | null = null;

  // Where the Volume list is open.
  @state() private choosing: Point | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('contextmenu', this.onMenu);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('contextmenu', this.onMenu);
  }

  private at(client: Point) {
    const rect = this.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  private readonly onChoose = (e: MouseEvent) => {
    const button = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.choosing = this.at({ x: button.left, y: button.bottom + 4 });
  };

  // In place of WebKit's own menu.
  private readonly onMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.choosing = this.at({ x: e.clientX, y: e.clientY });
  };

  override render() {
    const { unlinked } = this.unlinked;
    return html`
      <div class="note">
        <span class="why">${unlinkedLabel(unlinked)}</span>
        <span class="hint">${missingText(unlinked, this.cited)}</span>
        <button @click=${this.onChoose}>Choose a Volume…</button>
      </div>
      ${
        this.choosing === null
          ? nothing
          : html`<sl-scan-volumes
              .at=${this.choosing}
              @close=${() => {
                this.choosing = null;
              }}
            ></sl-scan-volumes>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-empty': ScanEmptyElement;
  }
}
