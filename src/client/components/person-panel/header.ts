import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { gedcomDate } from '@/common/dates';
import type { FactRow, PersonDetails, PersonRow } from '@/common/types';

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
  // No date known: "unknown", in the muted colour.
  unknown?: boolean;
}

function unknownLine(label: string): Line {
  return { label, text: 'unknown', unknown: true };
}

// The date of the first of `tags` that has one; the places are left to
// Events. One recorded without a date, as a death often is ("DEAT Y"),
// still says it happened, its date unknown.
function lineOf(facts: FactRow[], tags: string[]): Line | null {
  let bare: Line | null = null;
  for (const tag of tags) {
    const f = facts.find((x) => x.tag === tag);
    if (f === undefined) continue;
    const date = f.date === null ? '' : gedcomDate(f.date);
    if (date !== '') return { label: factLabel(f), text: date };
    bare ??= unknownLine(factLabel(f));
  }
  return bare;
}

// A year, or unknown for what `happened` without one.
function yearLine(label: string, year: number | null, happened: boolean) {
  if (!happened) return null;
  return year === null ? unknownLine(label) : { label, text: String(year) };
}

// Everyone was born, so birth always has a line, unknown when nothing of it
// is; death has one only when recorded. Until the first details arrive, the
// years the chart knows stand in.
function linesOf(person: PersonRow, details: PersonDetails | null) {
  const [born, died] =
    details?.id === person.id
      ? [lineOf(details.facts, BORN), lineOf(details.facts, DIED)]
      : [
          yearLine('Birth', person.birth_year, person.birth_year !== null),
          yearLine('Death', person.death_year, person.died)
        ];
  return [born ?? unknownLine('Birth'), died];
}

// The marked face once it is cropped, the whole photo if none is marked.
function renderPortrait(p: PersonRow, photo: string | null) {
  return photo === null
    ? html`<svg class="portrait" viewBox="-1 -1 2 2" aria-hidden="true">
        ${silhouette(p.sex, 0, 0, 1)}
      </svg>`
    : html`<img class="portrait" src=${photo} alt="" />`;
}

// The person the dock is about, in its header: their portrait as the chart
// draws it, their name, and when they were born and died, once the
// Selected person's details arrive.
@customElement('sl-person-header')
class PersonHeaderElement extends SignalWatcher(LitElement) {
  static override styles = personHeaderStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) person: PersonRow | null = null;
  // Their portrait as the chart's avatar cache gives it.
  @property({ attribute: false }) photo: string | null = null;

  override render() {
    const p = this.person;
    if (p === null) return nothing;
    const details = this.state.selected.details.get();
    const lines = linesOf(p, details).filter((l) => l !== null);
    return html`
      ${renderPortrait(p, this.photo)}
      <div class="who">
        <div class="name">${formatName(p)}</div>
        <dl>
          ${lines.map(
            (l) =>
              html`<dt>${l.label}</dt>
                <dd class=${l.unknown === true ? 'unknown' : ''}>${l.text}</dd>`
          )}
        </dl>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-header': PersonHeaderElement;
  }
}
