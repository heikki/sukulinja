import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { VolumeChoice, VolumeChoices } from '@/common/types';

import { placedInside } from '../context-menu';
import { scanVolumesStyles } from './edit-styles';
import { controlStyles } from './styles';

function stop(e: Event) {
  e.stopPropagation();
}

// Opened from the scan's menu, where it was: the Volumes of the current
// source's Book, those its years or Record range give first, then the
// others by years. Picking one shows it, leaving the source's Link as it
// is, and asks to `close`, as Esc and a press anywhere else do. The Volume shown is marked. Pointer and wheel input stays here, so
// scrolling it doesn't zoom the scan.
@customElement('sl-scan-volumes')
class ScanVolumesElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanVolumesStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) at: Point = { x: 0, y: 0 };

  @state() private choices: VolumeChoices | { failed: string } | null = null;

  private abort: AbortController | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('mousedown', this.onOutside);
    void this.load();
  }

  override updated() {
    const { x, y } = placedInside(this, this.at);
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('mousedown', this.onOutside);
    this.abort?.abort();
    this.abort = null;
  }

  // Marked handled, or the viewer's Esc closes it too, and WKWebView hands
  // it on to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  private close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  private readonly onOutside = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) this.close();
  };

  private async load() {
    const id = this.state.viewer.source.get()?.citation.id;
    if (id === undefined) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    try {
      this.choices = await this.state.api.volumeChoices(id, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return;
      if (!(err instanceof ApiError)) throw err;
      this.choices = { failed: err.message };
    }
    await this.updateComplete;
    const first = this.renderRoot.querySelector<HTMLElement>(
      'button[aria-current="true"], button'
    );
    first?.focus();
  }

  private pick(choice: VolumeChoice) {
    this.state.viewer.changeVolume(choice);
    this.close();
  }

  private renderGroup(heading: string, choices: VolumeChoice[]) {
    if (choices.length === 0) return nothing;
    const shown = this.state.viewer.volume.get()?.id;
    return html`
      <h3>${heading}</h3>
      <ul>
        ${choices.map((c) => {
          const current = c.id === shown;
          return html`
            <li>
              <button
                class=${current ? 'current' : ''}
                aria-current=${current ? 'true' : nothing}
                @click=${() => {
                  this.pick(c);
                }}
              >
                ${c.label}
              </button>
            </li>
          `;
        })}
      </ul>
    `;
  }

  override render() {
    const { choices } = this;
    if (choices === null) return html`<p class="muted">Finding Volumes…</p>`;
    if ('failed' in choices) {
      return html`<p class="muted">${choices.failed}</p>`;
    }
    if (choices.fits.length === 0 && choices.others.length === 0) {
      return html`<p class="muted">No other Volumes of this Book.</p>`;
    }
    return html`
      ${this.renderGroup('Fits the reference', choices.fits)}
      ${this.renderGroup('Other Volumes', choices.others)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-volumes': ScanVolumesElement;
  }
}
