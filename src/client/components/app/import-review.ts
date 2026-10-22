// What an import into an existing dataset would change, shown before it's
// saved (ADR-0013), and the date an Undo last import goes back from.

import type { ImportReview } from '@common/types';
import { html, nothing } from 'lit';

function count(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function change(
  what: { added: number; gone: number },
  one: string,
  many: string
) {
  return `${count(what.added, one, many)} added, ${what.gone.toLocaleString()} gone`;
}

function keptLine({ kept }: ImportReview) {
  const parts = [
    count(kept.marks, 'Mark', 'Marks'),
    count(
      kept.citations,
      'citation made in the app',
      'citations made in the app'
    ),
    count(kept.rejections, 'Rejection', 'Rejections')
  ];
  const duplicates =
    kept.duplicates === 0
      ? ''
      : ` ${count(kept.duplicates, 'citation made in the app is', 'citations made in the app are')} in the export now, and keep their link there.`;
  return `${parts.join(', ')}.${duplicates}`;
}

export function renderReview(review: ImportReview) {
  if (review.unreadable !== null) {
    return html`
      <div class="review">
        <p>
          The dataset can't be read (${review.unreadable}), so nothing is kept
          from it: the import replaces it.
        </p>
      </div>
    `;
  }
  return html`
    <div class="review">
      <p>
        <strong>From the export:</strong>
        ${change(review.people, 'person', 'people')};
        ${change(review.citations, 'citation', 'citations')}.
      </p>
      <p><strong>Kept from the app:</strong> ${keptLine(review)}</p>
      ${
        review.lost.length === 0
          ? nothing
          : html`
              <p>
                <strong>Can't be kept</strong>, as the export no longer has
                their person or record:
              </p>
              <ul class="lost">
                ${review.lost.map((l) => html`<li>${l}</li>`)}
              </ul>
            `
      }
    </div>
  `;
}

// When the dataset was last imported, as Undo last import names it.
export function importDate(importedAt: string | null) {
  if (importedAt === null) return '';
  return new Date(importedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
