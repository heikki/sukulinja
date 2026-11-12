import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { appState } from '@/client/state';
import type {
  AppState,
  Confirming,
  LeaveAnswer,
  LinkOpen,
  PendingCite
} from '@/client/state';
import { entryRoles } from '@/common/books';

import { controlStyles, editActionsStyles } from '../box-stage/styles';
import { formatName } from '../tree-view/renderer';
import { scanEditStyles } from './edit-styles';

function stop(e: Event) {
  e.stopPropagation();
}

function renderConfirming(confirming: Confirming) {
  return confirming === 'saving'
    ? html`<p>Confirming…</p>`
    : html`<p class="refused">${confirming.refused}</p>`;
}

// At the end of the nav while a Box is pending: Cancel and Save, and for a
// new Citation, whom it's for and a line for what the entry is. A way out
// of the source waiting on the Box asks there instead: Keep editing,
// Discard or Save. A Box waiting to be discarded, or a Citation made in
// the app to be deleted, asks to confirm. A Match being confirmed from its
// Box's menu says so, and why not when it's refused. Pointer and wheel input stays
// here, so a press doesn't pan. A Mark's Box is on a Record pin shared by
// everyone citing the record, whom it names from the dataset's people.
@customElement('sl-scan-edit')
class ScanEditElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, editActionsStyles, scanEditStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // The dataset's people, who name the citations.
  private get persons() {
    return this.state.chart.people.get().persons;
  }

  @state() private saving = false;
  // The server's words when a save was refused.
  @state() private refused: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
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

  private async save() {
    await this.run(true, async () => {
      await this.state.chart.save();
    });
  }

  private answer(given: LeaveAnswer) {
    void this.run(given === 'save', async () => {
      await this.state.viewer.answer(given);
    });
  }

  private renderSave(run: () => void) {
    return html`<button class="save" ?disabled=${this.saving} @click=${run}>
      ${this.saving ? 'Saving…' : 'Save'}
    </button>`;
  }

  private renderAsk() {
    return html`
      <p class="ask">Save this box first?</p>
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
        ${this.renderSave(() => {
          this.answer('save');
        })}
      </div>
    `;
  }

  // Asked as the menu item chosen was named.
  private renderDiscard(source: LinkOpen) {
    if (source.citation.madeInApp) return this.renderDelete();
    const what = source.link?.certainty === 'match' ? 'match' : 'mark';
    return html`
      <p>Discard this ${what}?</p>
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
          class="discard"
          ?disabled=${this.saving}
          @click=${() => {
            void this.run(true, async () => {
              await this.state.viewer.confirmDiscard();
            });
          }}
        >
          ${this.saving ? 'Discarding…' : 'Discard'}
        </button>
      </div>
    `;
  }

  private renderDelete() {
    return html`
      <p>Delete this citation?</p>
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
          class="discard"
          ?disabled=${this.saving}
          @click=${() => {
            void this.run(true, async () => {
              await this.state.viewer.confirmDiscard();
            });
          }}
        >
          ${this.saving ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    `;
  }

  // Whom the pending Citation is for, their Role in the entry where its
  // kind of book has Roles, and what the entry is, as typed.
  private renderCite(cite: PendingCite, volume: string) {
    const person = this.persons.get(cite.personId);
    const name = person === undefined ? 'someone' : formatName(person);
    return html`
      <p class="cite">New citation for ${name}</p>
      ${this.renderRoles(cite, volume)}
      <input
        class="cite-text"
        type="text"
        placeholder="What the entry is, e.g. Baptism 12.3.1795"
        aria-label="What the entry is"
        .value=${cite.text}
        @input=${(e: InputEvent) => {
          this.state.viewer.setCiteText((e.target as HTMLInputElement).value);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          void this.save();
        }}
      />
    `;
  }

  // The Roles to pick from, one or none: picking the one picked takes it
  // back.
  private renderRoles(cite: PendingCite, volume: string) {
    const roles = entryRoles(volume);
    if (roles.length === 0) return nothing;
    return html`
      <div class="segmented" role="group" aria-label="Their role in the entry">
        ${roles.map(
          ({ role, label }) => html`
            <button
              aria-pressed=${cite.role === role}
              @click=${() => {
                this.state.viewer.setCiteRole(cite.role === role ? null : role);
              }}
            >
              ${label}
            </button>
          `
        )}
      </div>
    `;
  }

  private renderActions() {
    return html`
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
        ${this.renderSave(() => {
          void this.save();
        })}
      </div>
    `;
  }

  // The others in the Volume sharing this one's Mark, whose Box moves or
  // goes with it.
  private also(source: LinkOpen, verb: string) {
    const rows = this.state.viewer.citations.get();
    const { markKey, id } = source.citation;
    if (!Array.isArray(rows)) return nothing;
    const names = rows
      .filter((r) => r.citation.markKey === markKey && r.citation.id !== id)
      .map((r) => {
        const person = this.persons.get(r.personId);
        return person === undefined ? null : formatName(person);
      })
      .filter((n) => n !== null);
    if (names.length === 0) return nothing;
    return html`<p class="also">${verb} ${names.join(', ')}.</p>`;
  }

  // A pending Citation, with a source or none; else what's asked of the
  // source.
  override render() {
    const { viewer } = this.state;
    const pending = viewer.pending.get();
    if (pending?.cite !== undefined) {
      return this.renderAsking(
        this.renderCite(pending.cite, pending.volume),
        this.renderSaving()
      );
    }
    const source = viewer.source.get();
    if (source === null) return nothing;
    const confirming = viewer.confirming.get();
    if (confirming !== null) return renderConfirming(confirming);
    return this.renderChange(source);
  }

  // The source's pending Box, or the Discard asked for.
  private renderChange(source: LinkOpen) {
    const { viewer } = this.state;
    if (viewer.discarding.get()) {
      return this.renderAsking(
        this.also(source, 'Also for'),
        this.renderDiscard(source)
      );
    }
    if (viewer.pending.get() === null) return nothing;
    return this.renderAsking(
      this.also(source, 'Also moves'),
      this.renderSaving()
    );
  }

  private renderSaving() {
    return this.state.viewer.leaving.get()
      ? this.renderAsk()
      : this.renderActions();
  }

  // What the change is about, why a save was refused, and what's asked.
  private renderAsking(about: unknown, asking: unknown) {
    return html`
      ${about}
      ${
        this.refused === null
          ? nothing
          : html`<p class="refused">${this.refused}</p>`
      }
      ${asking}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-edit': ScanEditElement;
  }
}
