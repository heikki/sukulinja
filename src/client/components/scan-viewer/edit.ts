import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@client/dataset-api';
import { linkLabel } from '@client/link-labels';
import { appState } from '@client/state';
import type { AppState, LeaveAnswer, PendingLink } from '@client/state';
import type { Link, LinkTarget } from '@common/types';

import { scanEditStyles } from './edit-styles';
import { controlStyles } from './styles';

function stop(e: Event) {
  e.stopPropagation();
}

function imagePart(image: number | undefined) {
  return image === undefined ? '' : ` · Image ${image}`;
}

function was(link: Link) {
  const image = 'image' in link ? link.image : undefined;
  return `${linkLabel(link)} · ${link.volume}${imagePart(image)}`;
}

function now(change: PendingLink) {
  const target: LinkTarget =
    change.image === undefined
      ? { precision: 'volume', certainty: 'marked' }
      : { precision: 'image', image: change.image, certainty: 'marked' };
  return `${linkLabel(target)} · ${change.volume}${imagePart(change.image)}`;
}

// Floating over the top of the scan while the current source has a change
// not saved: its Link as it was and as it will be, with Cancel and Save. A
// way out of the source waiting on the change asks instead: Save, Discard
// or Keep editing. Pointer and wheel input stays here, as in the nav.
@customElement('sl-scan-edit')
export class ScanEditElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanEditStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private saving = false;
  // The server's words when a save was refused.
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
  }

  private async run(saving: boolean, act: () => Promise<void>) {
    this.saving = saving;
    this.refused = null;
    try {
      await act();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  private answer(given: LeaveAnswer) {
    void this.run(given === 'save', async () => {
      await this.state.viewer.answer(given);
    });
  }

  private renderAsk() {
    return html`
      <p class="ask">Save this change first?</p>
      <div class="actions">
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.answer('keep');
          }}
        >
          Keep editing
        </button>
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.answer('discard');
          }}
        >
          Discard
        </button>
        <button
          class="save"
          ?disabled=${this.saving}
          @click=${() => {
            this.answer('save');
          }}
        >
          ${this.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    `;
  }

  private renderChange(link: Link, change: PendingLink) {
    return html`
      <dl>
        <dt>Was</dt>
        <dd>${was(link)}</dd>
        <dt>Now</dt>
        <dd>${now(change)}</dd>
      </dl>
      <div class="actions">
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.refused = null;
            this.state.viewer.cancel();
          }}
        >
          Cancel
        </button>
        <button
          class="save"
          ?disabled=${this.saving}
          @click=${() => {
            void this.run(true, async () => {
              await this.state.viewer.save();
            });
          }}
        >
          ${this.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    `;
  }

  override render() {
    const { viewer } = this.state;
    const source = viewer.source.get();
    const change = viewer.pending.get();
    if (source === null || change === null) return nothing;
    const name = source.citation.reference ?? 'this source';
    return html`
      <h3 title=${name}>${name}</h3>
      ${
        viewer.leaving.get()
          ? this.renderAsk()
          : this.renderChange(source.link, change)
      }
      ${this.refused === null ? nothing : html`<p class="refused">${this.refused}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-edit': ScanEditElement;
  }
}
