import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@client/dataset-api';
import { linkLabel } from '@client/link-labels';
import { appState } from '@client/state';
import type {
  AppState,
  LeaveAnswer,
  LinkOpen,
  PendingLink
} from '@client/state';
import type { Link, LinkTarget, PersonRow } from '@common/types';

import { formatName } from '../tree-view/renderer';
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

function targetOf({ image, box }: PendingLink): LinkTarget {
  if (image === undefined) return { precision: 'volume', certainty: 'marked' };
  return box === undefined
    ? { precision: 'image', image, certainty: 'marked' }
    : { precision: 'entry', image, box, certainty: 'marked' };
}

function now(change: PendingLink) {
  const label = linkLabel(targetOf(change));
  return `${label} · ${change.volume}${imagePart(change.image)}`;
}

// Floating over the top of the scan while the current source has a change
// not saved: its Link as it was and as it will be, with Cancel and Save. A
// way out of the source waiting on the change asks instead: Save, Discard
// or Keep editing. Pointer and wheel input stays here, as in the nav. A
// change on an Image moves the record for everyone citing it, whom it
// names from `persons`.
@customElement('sl-scan-edit')
export class ScanEditElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanEditStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

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

  // The others in the Volume citing the same record, by its URL.
  private alsoMoved(source: LinkOpen, change: PendingLink) {
    const rows = this.state.viewer.citations.get();
    const { url, id } = source.citation;
    if (change.image === undefined || url === null || !Array.isArray(rows)) {
      return nothing;
    }
    const names = rows
      .filter((r) => r.citation.url === url && r.citation.id !== id)
      .map((r) => {
        const person = this.persons.get(r.personId);
        return person === undefined ? null : formatName(person);
      })
      .filter((n) => n !== null);
    if (names.length === 0) return nothing;
    return html`<p class="also">
      Also moves the entry for ${names.join(', ')}.
    </p>`;
  }

  private renderChange(source: LinkOpen, change: PendingLink) {
    const { link } = source;
    return html`
      <dl>
        <dt>Was</dt>
        <dd>${was(link)}</dd>
        <dt>Now</dt>
        <dd>${now(change)}</dd>
      </dl>
      ${this.alsoMoved(source, change)}
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
          : this.renderChange(source, change)
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
