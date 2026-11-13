import type { CornerTab } from '../corner-panel/panel';

export type CornerList =
  'reminders' | 'changes' | 'church-books' | 'photos' | 'assistant';

// The corner panel's tabs, in the order of their buttons. The Assistant's
// shows only when it's turned on (assistant-flag.ts).
export const TABS: Array<CornerTab & { id: CornerList }> = [
  { id: 'reminders', label: 'Reminders' },
  { id: 'changes', label: 'Changes' },
  { id: 'church-books', label: 'Church books' },
  { id: 'photos', label: 'Photos' },
  { id: 'assistant', label: 'Assistant' }
];

export function tabsShown(assistant: boolean) {
  return assistant ? TABS : TABS.filter((t) => t.id !== 'assistant');
}

// The lists button's name, with how many Reminders are open.
export function listsLabel(open: number, assistant = false) {
  const reminders = open === 1 ? '1 open Reminder' : `${open} open Reminders`;
  const lists = assistant
    ? 'Reminders, Changes, Church books, Photos and Assistant'
    : 'Reminders, Changes, Church books and Photos';
  return `${lists} (${reminders})`;
}
