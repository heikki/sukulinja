// The operations on a dataset's Reminders: listing them, writing one,
// changing or deleting one.

import type { Reminder, ReminderChange, ReminderTarget } from '@/common/types';

import { answers, asksNothing } from './operation';
import { fieldsOf, isId, isName } from './read';
import type { Fields } from './read';

function imageOf(on: Fields) {
  const { volumeId, volume, image, fileId } = on;
  if (!isName(volumeId) || typeof volume !== 'string') return null;
  if (!isId(image) || !isName(fileId)) return null;
  return { volumeId, volume, image, fileId };
}

// `{ volumeId, volume, image, fileId }`, with `personId` too for one about
// someone; or `{ personId }`. Undefined when it's neither.
function targetOf(value: unknown): ReminderTarget | undefined {
  const on = fieldsOf(value);
  if (on === null) return undefined;
  const { personId } = on;
  if ('volumeId' in on) {
    const image = imageOf(on);
    if (image === null) return undefined;
    if (personId === undefined) return image;
    return isId(personId) ? { ...image, personId } : undefined;
  }
  return isId(personId) ? { personId } : undefined;
}

// `{ text?, done? }`.
function changeOf(value: unknown): ReminderChange | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { text, done } = fields;
  const change: ReminderChange = {};
  if (text !== undefined) {
    if (typeof text !== 'string') return null;
    change.text = text;
  }
  if (done !== undefined) {
    if (typeof done !== 'boolean') return null;
    change.done = done;
  }
  return change;
}

export const REMINDER_OPERATIONS = {
  // Every Reminder, newest first, open or done.
  reminders: asksNothing<Reminder[]>(),

  // Writes a Reminder on the target, or with `on` null, on nothing: it as
  // stored.
  remind: answers<{ text: string; on: ReminderTarget | null }, Reminder>(
    '{ text, on }',
    ({ text, on }) => {
      const target = on === null ? null : targetOf(on);
      return typeof text === 'string' && target !== undefined
        ? { text, on: target }
        : null;
    }
  ),

  // Changes a Reminder's text, or marks it done or open again: it as
  // stored.
  changeReminder: answers<{ id: number; change: ReminderChange }, Reminder>(
    '{ id, change: { text?, done? } }',
    ({ id, change }) => {
      const read = changeOf(change);
      return isId(id) && read !== null ? { id, change: read } : null;
    }
  ),

  deleteReminder: answers<{ id: number }, undefined>('{ id }', ({ id }) =>
    isId(id) ? { id } : null
  )
};
