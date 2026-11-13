import type { CornerTab } from '../corner-panel/panel';

export type CornerList =
  'reminders' | 'changes' | 'church-books' | 'photos' | 'assistant';

// The corner panel's tabs, in the order of their buttons.
export const TABS: Array<CornerTab & { id: CornerList }> = [
  { id: 'reminders', label: 'Reminders' },
  { id: 'changes', label: 'Changes' },
  { id: 'church-books', label: 'Church books' },
  { id: 'photos', label: 'Photos' },
  { id: 'assistant', label: 'Assistant' }
];

// The lists button's name, with how many Reminders are open.
export function listsLabel(open: number) {
  const reminders = open === 1 ? '1 open Reminder' : `${open} open Reminders`;
  return `Reminders, Changes, Church books, Photos and Assistant (${reminders})`;
}
