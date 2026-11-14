// The operations on a dataset's Reminders (common/operations/reminders),
// answered by its Reminders.

import type { REMINDER_OPERATIONS } from '@/common/operations/reminders';

import { answered, notFound } from '../operations';
import type { Handlers } from '../operations';
import type { createReminders } from './reminders';

export function reminderOperations(
  reminders: ReturnType<typeof createReminders>
): Handlers<typeof REMINDER_OPERATIONS> {
  return {
    reminders: async () => await reminders.list(),
    remind: async ({ text, on }) =>
      answered(await reminders.add(text, on), 'person'),
    changeReminder: async ({ id, change }) =>
      answered(await reminders.change(id, change), 'reminder'),
    deleteReminder({ id }) {
      if (!reminders.remove(id)) throw notFound('reminder');
    }
  };
}
