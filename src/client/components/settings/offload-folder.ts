import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import type { AppApi } from '@/client/dataset-api/app';
import { focusRingStyles } from '@/client/focus-ring';
import { appApi } from '@/client/state';
import type { OffloadFolder } from '@/common/types';

// The folder set, and whether it's attached; or that there's none.
function renderFolder(folder: OffloadFolder | null) {
  if (folder === null) {
    return html`<span class="muted"
      >None: an offload drops the images it doesn't keep.</span
    >`;
  }
  return html`<span class="path" title=${folder.path}>${folder.path}</span> ${
      folder.attached
        ? nothing
        : html`<span class="away"
            >Not attached: its images can't be read.</span
          >`
    }`;
}

// Settings' Offload folder row, under Storage: where an offload
// moves the Images a Volume doesn't keep, an external drive say, and
// whether it's attached; with none, an offload drops them. Chosen with the
// app's folder picker; Clear sets none. Asked for each time Settings opens.
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
    void this.ask(async () => await this.app.offloadFolder());
  }

  private async ask(asked: () => Promise<OffloadFolder | null>) {
    await this.asking.run(async () => {
      this.folder = await asked();
    });
  }

  override render() {
    const { folder } = this;
    const { app } = this;
    return html`
      ${
        folder === undefined
          ? html`<span class="muted">Asking the app…</span>`
          : renderFolder(folder)
      }
      ${
        this.asking.refused === null
          ? nothing
          : html`<span class="away">${this.asking.refused}</span>`
      }
      <div class="acts">
        <button
          ?disabled=${this.asking.busy}
          @click=${() => {
            void this.ask(async () => await app.chooseOffloadFolder());
          }}
        >
          Choose…
        </button>
        ${
          folder === null || folder === undefined
            ? nothing
            : html`<button
                ?disabled=${this.asking.busy}
                @click=${() => {
                  void this.ask(async () => await app.clearOffloadFolder());
                }}
              >
                Clear
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
