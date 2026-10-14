import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { apiUrl } from '@client/api';
import type { CitationRow, PersonDetails, RecordView } from '@common/types';

import { factLabel, factText } from './helpers';
import { personPanelStyles } from './styles';

function renderRecord(r: RecordView) {
  return html`
    <div class="who">${r.name}</div>
    <dl>
      ${r.fields.map(
        (f) =>
          html`<dt>${f.label}</dt>
            <dd>${f.value}</dd>`
      )}
    </dl>
    ${
      r.household.length === 0
        ? nothing
        : html`
            <details>
              <summary>Household · ${r.household.length}</summary>
              <table>
                ${r.household.map(
                  (m) => html`
                    <tr>
                      <td>${m.relation ?? ''}</td>
                      <td>${m.name}</td>
                      <td>${m.born ?? ''}</td>
                    </tr>
                  `
                )}
              </table>
            </details>
          `
    }
  `;
}

function renderCitation(c: CitationRow) {
  return html`
    <article class="source">
      ${
        c.source === null
          ? nothing
          : html`<div class="caption">${c.source}</div>`
      }
      ${
        c.record === null
          ? html`<p class="text">${c.text ?? c.page ?? ''}</p>`
          : renderRecord(c.record)
      }
      ${
        c.url === null
          ? nothing
          : html`
              <div class="links">
                <a href=${c.url} target="_blank" rel="noopener">Record ↗</a>
              </div>
            `
      }
    </article>
  `;
}

// The Focus person's events and sources, beside the chart. Links open
// outside the app (the desktop shell hands target=_blank to the browser).
@customElement('sl-person-panel')
export class PersonPanelElement extends LitElement {
  static override styles = personPanelStyles;

  @property({ type: Number }) personId: number | null = null;

  @state() private details: PersonDetails | null = null;
  @state() private error: string | null = null;

  // Refocusing fast can return answers out of order; only the latest counts.
  private request = 0;

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('personId')) void this.load();
  }

  private async load() {
    const id = this.personId;
    const request = ++this.request;
    if (id === null) {
      this.details = null;
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/persons/${id}`));
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const details = (await res.json()) as PersonDetails;
      if (request !== this.request) return;
      this.details = details;
      this.error = null;
    } catch (err) {
      if (request !== this.request) return;
      this.error = err instanceof Error ? err.message : 'failed to load';
    }
  }

  override render() {
    if (this.error !== null) {
      return html`<div class="body muted">Couldn't load: ${this.error}</div>`;
    }
    const d = this.details;
    if (d === null) return html`<div class="body muted">Loading…</div>`;
    const stale = d.id !== this.personId;
    return html`
      <div class="body ${stale ? 'stale' : ''}">
        <h2>${d.name ?? '—'}</h2>
        ${
          d.facts.length === 0
            ? nothing
            : html`
                <h3>Events</h3>
                <dl>
                  ${d.facts.map(
                    (f) =>
                      html`<dt>${factLabel(f)}</dt>
                        <dd>${factText(f)}</dd>`
                  )}
                </dl>
              `
        }
        ${
          d.citations.length === 0
            ? nothing
            : html`
                <h3>Sources · ${d.citations.length}</h3>
                ${d.citations.map((c) => renderCitation(c))}
              `
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
