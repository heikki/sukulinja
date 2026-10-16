import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { mediaUrl } from '@client/api';
import { gedcomDate } from '@common/dates';
import type { FactRow, PersonDetails, PersonRow } from '@common/types';

import { avatarUrl, onAvatarReady } from '../tree-view/avatar-cache';
import { formatName } from '../tree-view/renderer';
import { silhouette } from '../tree-view/silhouette';
import { factLabel } from './helpers';
import { personHeaderStyles } from './styles';

// Birth and death, or failing those the christening and burial.
const BORN = ['BIRT', 'CHR', 'BAPM'];
const DIED = ['DEAT', 'BURI', 'CREM'];

interface Line {
  label: string;
  text: string;
}

function lineOf(facts: FactRow[], tags: string[]): Line | null {
  for (const tag of tags) {
    const f = facts.find((x) => x.tag === tag);
    if (f === undefined) continue;
    const date = f.date === null ? null : gedcomDate(f.date);
    const text = [date, f.place].filter((x) => x !== null && x !== '');
    if (text.length > 0) return { label: factLabel(f), text: text.join(' · ') };
  }
  return null;
}

function yearLine(label: string, year: number | null): Line | null {
  return year === null ? null : { label, text: String(year) };
}

// Until the details arrive, the years the chart knows stand in.
function linesOf(person: PersonRow, details: PersonDetails | null) {
  if (details?.id === person.id) {
    return [lineOf(details.facts, BORN), lineOf(details.facts, DIED)];
  }
  return [
    yearLine('Birth', person.birth_year),
    yearLine('Death', person.death_year)
  ];
}

// The marked face once it is cropped, the whole photo if none is marked.
function renderPortrait(p: PersonRow) {
  const src =
    p.photo_path === null
      ? null
      : p.crop === null
        ? mediaUrl(p.photo_path)
        : avatarUrl(p);
  return src === null
    ? html`<svg class="portrait" viewBox="-1 -1 2 2" aria-hidden="true">
        ${silhouette(p.sex, 0, 0, 1)}
      </svg>`
    : html`<img class="portrait" src=${src} alt="" />`;
}

// The person the dock is about, in its header: their portrait as the chart
// draws it, their name, and when they were born and died.
@customElement('sl-person-header')
export class PersonHeaderElement extends LitElement {
  static override styles = personHeaderStyles;

  @property({ attribute: false }) person: PersonRow | null = null;
  @property({ attribute: false }) details: PersonDetails | null = null;

  private avatarUnsub: (() => void) | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.avatarUnsub = onAvatarReady(() => {
      this.requestUpdate();
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.avatarUnsub?.();
    this.avatarUnsub = null;
  }

  override render() {
    const p = this.person;
    if (p === null) return nothing;
    const lines = linesOf(p, this.details).filter((l) => l !== null);
    return html`
      ${renderPortrait(p)}
      <div class="who">
        <div class="name">${formatName(p)}</div>
        ${
          lines.length === 0
            ? nothing
            : html`<dl>
                ${lines.map(
                  (l) =>
                    html`<dt>${l.label}</dt>
                      <dd>${l.text}</dd>`
                )}
              </dl>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-header': PersonHeaderElement;
  }
}
