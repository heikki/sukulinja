// A Volume's page numbers worked on from the Volumes tab (ADR-0032): the
// menu its Page numbers cell opens, marking them checked or as none, or
// unmarked; and, not marked, a page survey (while the Assistant is on) or
// taking those read or set away, each asked first where it takes away
// what can't be got back.

import { html, nothing } from 'lit';

import type { Point } from '@/client/pan-zoom';
import type { PageMark } from '@/common/types';

import '../context-menu';

import type { MenuItem } from '../context-menu';
import type { VolumeRow } from './rows';

// An open menu, its Volume and where it drops from in the tab; with
// `ask`, the question before a step that takes pages away.
export interface PagesMenu {
  book: VolumeRow;
  at: Point;
  ask?: { heading: string; step: MenuItem };
}

export interface PagesActions {
  mark: (book: VolumeRow, as: PageMark | null) => void;
  // The model a survey asks, by its label; null while the Assistant is
  // off.
  model: string | null;
  survey: (book: VolumeRow) => void;
  clear: (book: VolumeRow) => void;
}

export function pagesItems(book: VolumeRow, on: PagesActions): MenuItem[] {
  function mark(as: PageMark | null) {
    return () => {
      on.mark(book, as);
    };
  }
  if (book.pages === 'checked') {
    return [{ label: 'Unmark page numbers checked', run: mark(null) }];
  }
  if (book.pages === 'none') {
    return [{ label: 'Unmark no page numbers', run: mark(null) }];
  }
  const items: MenuItem[] = [];
  if (on.model !== null) {
    items.push({
      label: 'Survey page numbers',
      detail: on.model,
      run: () => {
        on.survey(book);
      }
    });
  }
  if (book.pages === 'read') {
    items.push({
      label: 'Clear page numbers',
      run: () => {
        on.clear(book);
      }
    });
  }
  items.push(
    { label: 'Mark page numbers checked', run: mark('checked') },
    {
      label: 'Mark as no page numbers',
      detail: 'References place the volume only',
      run: mark('none')
    }
  );
  return items;
}

function images(n: number) {
  return n === 1 ? '1 Image' : `${n} Images`;
}

// The questions before a survey takes away pages set by hand, and before
// clearing takes away every page read or set.
export function surveyAsk(byHand: number) {
  return `The survey takes away ${byHand === 1 ? 'the page' : `${byHand} pages`} set by hand in this Volume`;
}

export function clearAsk(pinned: number) {
  return `Takes away the page numbers read or set on ${images(pinned)} of this Volume`;
}

// The menu, or its question: the step, or Cancel.
export function renderPagesMenu(
  menu: PagesMenu | null,
  on: PagesActions,
  close: () => void
) {
  if (menu === null) return nothing;
  const { ask } = menu;
  const items =
    ask === undefined
      ? pagesItems(menu.book, on)
      : [ask.step, { label: 'Cancel', run: close }];
  return html`<sl-context-menu
    .heading=${ask?.heading ?? null}
    .items=${items.map((i) => ({
      ...i,
      run: () => {
        close();
        i.run();
      }
    }))}
    .at=${menu.at}
    .arrow=${true}
    @close=${close}
  ></sl-context-menu>`;
}
