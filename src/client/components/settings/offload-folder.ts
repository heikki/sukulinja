import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import type { AppApi } from '@/client/dataset-api/app';
import { focusRingStyles } from '@/client/focus-ring';
import { appApi } from '@/client/state';
import type { OffloadFolder } from '@/common/types';

import { folderName } from './helpers';
import { knownOf } from './known';

// The folder set, by name, and whether its drive is connected; or that
// there's none. What it's for, the full path and what offloading does
// without one show on hover.
function renderFolder(folder: OffloadFolder | null) {
  if (folder === null) {
    return html`<span
      class="muted"
      title="Without one, offloading a volume deletes the scans it doesn't keep"
      >Not set</span
    >`;
  }
  return html`<span
      class="path"
      title="${folder.path}
Offloaded volumes' scans are kept here"
      >${folderName(folder.path)}</span
    >
    ${
      folder.attached
        ? nothing
        : html`<span
            class="away"
            title="Scans offloaded there can't be opened until it is"
            >Drive not connected</span
          >`
    }`;
}

// Settings' Offload folder row, under Scans on disk: where an offload
// moves the Images a Volume doesn't keep, an external drive say, and
// whether its drive is connected; with none, an offload drops them. Chosen
// with the app's folder picker; once set, Stop using is offered instead,
// setting none and deleting nothing in it. Asked for each time Settings
// opens, drawn meanwhile as it last stood.
@customElement('sl-offload-folder')
class OffloadFolderElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: grid;
        gap: 0.3rem;
        max-width: 16rem;
        font-size: 0.8rem;
      }
      .path {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .muted {
        color: var(--muted);
        white-space: normal;
      }
      .away {
        color: var(--danger);
        white-space: normal;
      }
      .acts {
        display: flex;
        gap: 0.75rem;
      }
      button {
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
        font: inherit;
        cursor: pointer;
      }
      button:hover:not(:disabled) {
        text-decoration: underline;
      }
      button:disabled {
        color: var(--muted);
        cursor: default;
      }
    `
  ];

  @consume({ context: appApi }) private readonly app!: AppApi;

  // Undefined until asked.
  @state() private folder: OffloadFolder | null | undefined = undefined;

  private readonly asking = new Asking(this);

  override connectedCallback() {
    super.connectedCallback();
    this.folder = knownOf(this.app).folder;
    void this.ask(async () => await this.app.offloadFolder());
  }

  private async ask(asked: () => Promise<OffloadFolder | null>) {
    await this.asking.run(async () => {
      const folder = await asked();
      this.folder = folder;
      knownOf(this.app).folder = folder;
    });
  }

  override render() {
    const { folder } = this;
    const { app } = this;
    return html`
      ${
        folder === undefined
          ? this.asking.refused === null
            ? html`<span class="muted">Asking the app…</span>`
            : nothing
          : renderFolder(folder)
      }
      ${
        this.asking.refused === null
          ? nothing
          : html`<span class="away">${this.asking.refused}</span>`
      }
      <div class="acts">
        ${
          folder === null || folder === undefined
            ? html`<button
                ?disabled=${this.asking.busy}
                @click=${() => {
                  void this.ask(async () => await app.chooseOffloadFolder());
                }}
              >
                Choose…
              </button>`
            : html`<button
                ?disabled=${this.asking.busy}
                title="Forgets the folder; nothing in it is deleted, but the scans offloaded there can't be opened until it's chosen again"
                @click=${() => {
                  void this.ask(async () => await app.clearOffloadFolder());
                }}
              >
                Stop using
              </button>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-offload-folder': OffloadFolderElement;
  }
}
