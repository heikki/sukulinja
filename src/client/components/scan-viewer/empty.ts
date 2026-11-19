import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { missingText, unlinkedLabel } from '@/client/link-labels';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { CitedBook, UnlinkedResolution } from '@/common/types';

import { controlStyles } from '../box-stage/styles';
import { scanEmptyStyles } from './styles';
import { renderVolumeChange } from './volume-change';

// The stage before any Volume is shown, for a source with no Link: what's
// missing, by its parish, Book and years (`cited`), and the parish's Volumes
// to look through for it in the Volume picker, from the button or a
// right-click. Choosing one shows it in place of this.
@customElement('sl-scan-empty')
class ScanEmptyElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanEmptyStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) unlinked!: UnlinkedResolution;
  @property({ attribute: false }) cited: CitedBook | null = null;

  // Where the Volume picker was asked for, while it's open.
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
          : renderVolumeChange(
              this.state.viewer,
              () => {
                this.choosing = null;
              },
              this.unlinked.archive ?? null
            )
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-empty': ScanEmptyElement;
  }
}
