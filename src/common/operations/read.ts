// Taking a request's body apart: each reader gives the value, or null for
// anything else. Shared by the operations' `read`s.

import type { Box } from '@/common/types';

export type Fields = Record<string, unknown>;

// An object's fields, or null for anything else.
export function fieldsOf(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

// A row's id: a whole number above 0.
export function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// A string with something in it: an id of Astia's, a label.
export function isName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

// An id, or null for none.
export function isIdOrNull(value: unknown): value is number | null {
  return value === null || isInteger(value);
}

// A string that may be left out: the string, null when it's left out or
// null, undefined when it's anything else.
export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

// A Box's four numbers, or null for one that isn't.
export function boxOf(value: unknown): Box | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { left, top, width, height } = fields;
  if (typeof left !== 'number' || typeof top !== 'number') return null;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  return { left, top, width, height };
}

// Each of a list, read: null if it isn't a list, or any of it isn't read.
export function listOf<T>(value: unknown, read: (v: unknown) => T | null) {
  if (!Array.isArray(value)) return null;
  const items = value.map(read);
  return items.some((v) => v === null) ? null : (items as T[]);
}
