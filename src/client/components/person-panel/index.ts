import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState, Chart, LinkOpen } from '@/client/state';
import type { PhotoRow } from '@/common/types';

import { CROSS, formatName } from '../tree-view/renderer';

import './events';
import './fold';
import './header';
import './sources';

import { householdsOf, lifeText } from './family';
import type { Household, Relative } from './family';
import { renderPhotos } from './photos';
import { personPanelStyles } from './styles';

// Each section open or not for the rest of the visit, across people; at
// first only the sources are.
const opened = {
  events: false,
  family: false,
  photos: false,
  sources: true
};
type Section = keyof typeof opened;

// Dates as the list writes them, the cross they end with a size up.
function crossed(life: string) {
  if (!life.endsWith(CROSS)) return life;
  return html`${life.slice(0, -CROSS.length)}<span class="cross"
      >${CROSS}</span
    >`;
}

// A relative's row selects them, and a double-click builds the chart
// around them.
function renderRelative(r: Relative, chart: Chart) {
  const life = lifeText(r.person);
  return html`<button
    class="relative"
    @click=${() => {
      chart.select(r.person.id);
    }}
    @dblclick=${() => {
      chart.makeRoot(r.person.id);
    }}
  >
    <span class="relation">${r.relation}</span>
    <span class="person">
      <span class="name">${formatName(r.person)}</span>
      ${life === '' ? nothing : html`<span class="life">${crossed(life)}</span>`}
    </span>
  </button>`;
}

// The Selected person's family, events, sources and Photos, beside the
// chart. A Photo opens in the Photo viewer; the source the Scan viewer
// shows is brought into view.
@customElement('sl-person-panel')
class PersonPanelElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personPanelStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // Whether the dock holding the panel is open.
  @property({ type: Boolean }) docked = false;

  // Whose details are shown.
  private shownId: number | null = null;
  // The source last brought into view.
  private revealed: LinkOpen | null = null;

  // The source the Scan viewer shows, unless it has moved off its Link.
  private get viewing() {
    const { viewer } = this.state;
    return viewer.away.get() ? null : viewer.source.get();
  }

  // Whether the sources can be seen: their section is open, and so is the
  // dock holding the panel.
  private sourcesShown() {
    return opened.sources && this.docked;
  }

  // A new person starts at the top.
  override updated() {
    const { viewer } = this.state;
    viewer.setSourcesInView(this.sourcesShown());
    const { viewing } = this;
    if (viewing !== this.revealed) {
      this.revealed = viewing;
      void this.revealViewing();
    }
    const id = this.state.selected.details.get()?.id ?? null;
    if (id === this.shownId) return;
    this.shownId = id;
    this.scrollTop = 0;
  }

  // Sources, opened if need be and once they've slid open.
  private async openSources() {
    const section = () =>
      this.renderRoot.querySelector('[data-section="sources"]');
    if (!opened.sources) {
      opened.sources = true;
      this.requestUpdate();
      await this.updateComplete;
      await section()?.querySelector('sl-fold')?.settled();
    }
    return section()?.querySelector('sl-person-sources') ?? null;
  }

  // The source in the Scan viewer, scrolled to.
  private async revealViewing() {
    const id = this.viewing?.citation.id;
    if (id === undefined) return;
    await (await this.openSources())?.reveal(id);
  }

  // A source picked under a Fact, unfolded and scrolled to.
  private async showSource(citationId: number) {
    await (await this.openSources())?.show(citationId);
  }

  private renderFamily(households: Household[]) {
    return households.map(
      (h) => html`
        <div class="family">
          ${h.map((r) => renderRelative(r, this.state.chart))}
        </div>
      `
    );
  }

  // Clicked again while the Photo viewer shows it, it closes the viewer.
  private renderPhotos(photos: PhotoRow[]) {
    const { photoViewer, chart, api } = this.state;
    const shown = photoViewer.opened.get()?.id ?? null;
    return renderPhotos(photos, shown, {
      url: api.mediaUrl,
      open: (p) => {
        if (p.id === shown) photoViewer.close();
        else chart.openPhoto(p);
      }
    });
  }

  // A heading that shows or hides what follows it.
  private renderSection(
    section: Section,
    label: string,
    content: () => unknown
  ) {
    const open = opened[section];
    return html`
      <section data-section=${section}>
        <h3>
          <button
            class="toggle"
            aria-expanded=${open ? 'true' : 'false'}
            @click=${() => {
              opened[section] = !open;
              this.requestUpdate();
            }}
          >
            ${label}
          </button>
        </h3>
        <sl-fold .open=${open}>
          <div class="section-body">${content()}</div>
        </sl-fold>
      </section>
    `;
  }

  override render() {
    const { selected } = this.state;
    const error = selected.error.get();
    if (error !== null) {
      return html`<div class="body muted">Couldn't load: ${error}</div>`;
    }
    const d = selected.details.get();
    if (d === null) return html`<div class="body muted">Loading…</div>`;
    const stale = d.id !== selected.id.get();
    const households = householdsOf(d.id, this.state.chart.people.get());
    return html`
      <div class="body ${stale ? 'stale' : ''}">
        ${
          households.length === 0
            ? nothing
            : this.renderSection('family', 'Family', () =>
                this.renderFamily(households)
              )
        }
        ${this.renderSection(
          'events',
          'Events',
          () =>
            html`<sl-person-events
              .facts=${d.facts}
              .marriages=${d.marriages}
              @show-source=${(e: CustomEvent<number>) => {
                void this.showSource(e.detail);
              }}
            ></sl-person-events>`
        )}
        ${
          d.citations.length === 0
            ? nothing
            : this.renderSection(
                'sources',
                'Sources',
                () =>
                  html`<sl-person-sources
                    ?shown=${this.sourcesShown()}
                  ></sl-person-sources>`
              )
        }
        ${
          d.photos.length === 0
            ? nothing
            : this.renderSection('photos', 'Photos', () =>
                this.renderPhotos(d.photos)
              )
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-panel': PersonPanelElement;
  }
}
