import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { volumeTitle } from '@/client/link-labels';
import { appState } from '@/client/state';
import type { AppState, ImageOpen, LinkOpen } from '@/client/state';

import { controlStyles, scanToolbarStyles } from './styles';

// The archive of a source's Link, or of the books it wasn't found in; or
// of an Image opened with no source, when it's known.
function archiveOf(opened: LinkOpen | ImageOpen) {
  if (!('citation' in opened)) return opened.archive;
  return opened.link === null ? opened.unlinked.archive : opened.link.archive;
}

// The Scan viewer's one row: the archive and the Volume shown. The source
// clicked again, or Escape, closes the viewer.
@customElement('sl-scan-toolbar')
class ScanToolbarElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanToolbarStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  override render() {
    const { viewer } = this.state;
    const opened = viewer.opened.get();
    if (opened === null) return nothing;
    const shown = viewer.volume.get();
    const named = archiveOf(opened);
    const archive = named === undefined ? '' : `${named} · `;
    const volume = shown === null ? 'No Volume' : volumeTitle(shown.label);
    return html` <span class="volume">${archive}${volume}</span> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-toolbar': ScanToolbarElement;
  }
}
