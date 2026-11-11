import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import type { Viewport } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PhotoRow } from '@/common/types';

import { PictureStage } from '../box-stage/stage';
import { controlStyles, viewerStyles } from '../box-stage/styles';
import { photoBoxes } from './photo-boxes';

import '../box-stage/boxes';
import '../box-stage/toolbar';
import './people';

// ←/→ step through the Selected person's Photos.
const STEPS: Record<string, 1 | -1> = { ArrowLeft: -1, ArrowRight: 1 };

function typing(e: KeyboardEvent) {
  const on = e.composedPath()[0];
  return (
    on instanceof HTMLInputElement ||
    on instanceof HTMLTextAreaElement ||
    (on instanceof HTMLElement && on.isContentEditable)
  );
}

// The Photo viewer: a Photo of the Selected person's, over the chart, to
// pan and zoom as the Scan viewer does. The Boxes of the people marked on
// it show as their rows beside it are hovered, the Selected person's
// always; each Box and row leads to its person. Esc, or the Photo clicked
// again in the panel, closes it.
@customElement('sl-photo-viewer')
class PhotoViewerElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    viewerStyles,
    css`
      sl-stage-boxes {
        --box-color: var(--accent);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // The Photo drawn, and its size once it's loaded.
  private shown: PhotoRow | null = null;
  @state() private size: Viewport | null = null;
  @state() private failed = false;
  // The key of the person picked out, on the Photo and in the list.
  @state() private hovered: string | null = null;
  private focusing = false;

  private readonly stage = new PictureStage(this, {
    stage: () => this.renderRoot.querySelector('.stage'),
    size: () => this.size,
    footRoom: () => 0,
    // A small Photo fills the stage, as a scan does.
    maxFit: Infinity
  });

  // A region of its own, focused as it opens. Its keys work while it's
  // open, wherever focus is.
  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Photo viewer');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private get photo() {
    return this.state.photoViewer.opened.get();
  }

  // Another Photo starts loading from nothing: Photos differ in shape, so
  // each is fitted anew.
  override willUpdate() {
    const { photo } = this;
    if (photo?.id === this.shown?.id) {
      this.shown = photo;
      return;
    }
    this.focusing = this.shown === null;
    this.shown = photo;
    this.size = null;
    this.failed = false;
    this.hovered = null;
    this.stage.placeView(null);
  }

  override updated() {
    if (!this.focusing) return;
    this.focusing = false;
    this.focus({ preventScroll: true });
  }

  private readonly onLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    this.size = { width: img.naturalWidth, height: img.naturalHeight };
    // Fitted once the stage has the size to fit.
    void this.updateComplete.then(() => {
      this.stage.placeView({ fit: true, rescale: 1 });
    });
  };

  private readonly onError = () => {
    this.failed = true;
  };

  // Every key handled here is marked so, or WKWebView hands it on to
  // macOS, which beeps at it. What lies over the viewer, a menu or a
  // corner popover, takes Esc first and stops it.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.state.photoViewer.close();
      return;
    }
    const by = STEPS[e.key];
    if (by === undefined || typing(e)) return;
    e.preventDefault();
    this.state.photoViewer.step(by);
  };

  private readonly onHover = (e: CustomEvent<string | null>) => {
    this.hovered = e.detail;
  };

  private readonly onPick = (e: CustomEvent<string>) => {
    this.state.chart.select(Number(e.detail));
  };

  // "Photo 2 of 3", of the Selected person's.
  private heading(photo: PhotoRow) {
    const photos = this.state.selected.details.get()?.photos ?? [];
    const at = photos.findIndex((p) => p.id === photo.id);
    return at === -1 || photos.length < 2
      ? 'Photo'
      : `Photo ${at + 1} of ${photos.length}`;
  }

  private renderNote() {
    if (this.failed) {
      return html`<div class="note"><span>Photo unavailable</span></div>`;
    }
    if (this.size !== null) return nothing;
    return html`<div class="note">
      <span class="loading later">Loading photo…</span>
    </div>`;
  }

  private renderStage(photo: PhotoRow) {
    const { view } = this.stage;
    const at =
      view === null
        ? ''
        : `transform: translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
    return html`
      <div
        class="stage ${this.stage.dragging ? 'dragging' : ''}"
        @mousedown=${this.stage.onMouseDown}
        @wheel=${this.stage.onWheel}
        @gesturestart=${this.stage.onGestureStart}
        @gesturechange=${this.stage.onGestureChange}
        @gestureend=${this.stage.onGestureEnd}
        @dblclick=${this.stage.onDblClick}
      >
        <img
          class=${view === null ? 'hidden' : ''}
          src=${this.state.api.mediaUrl(photo.path)}
          alt="Photo"
          draggable="false"
          style=${at}
          @load=${this.onLoad}
          @error=${this.onError}
        />
        ${
          view === null
            ? nothing
            : html`<sl-stage-boxes
                live
                .boxes=${photoBoxes(photo.people, this.state.selected.id.get())}
                .view=${view}
                .hovered=${this.hovered}
                @box-hover=${this.onHover}
                @box-pick=${this.onPick}
              ></sl-stage-boxes>`
        }
        ${this.renderNote()}
      </div>
    `;
  }

  override render() {
    const { photo } = this;
    if (photo === null) return nothing;
    return html`
      <sl-viewer-toolbar heading=${this.heading(photo)}></sl-viewer-toolbar>
      <div class="body">
        ${this.renderStage(photo)}
        <sl-photo-people
          .people=${photo.people}
          .hovered=${this.hovered}
          @box-hover=${this.onHover}
        ></sl-photo-people>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photo-viewer': PhotoViewerElement;
  }
}
