import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { controlStyles, toolbarStyles } from './styles';

// A viewer's one row, over its picture: what it shows.
@customElement('sl-viewer-toolbar')
class ViewerToolbarElement extends LitElement {
  static override styles = [controlStyles, toolbarStyles];

  @property() heading = '';

  override render() {
    return html`<span class="title">${this.heading}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-viewer-toolbar': ViewerToolbarElement;
  }
}
