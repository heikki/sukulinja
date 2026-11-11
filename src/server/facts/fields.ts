// What a Fact's fields, as typed in the panel, say as stored, or why they
// can't be stored.

import { gedcomDate, TYPED_DATE_FORMS, typedDate } from '@/common/dates';
import { factKindLabel, hasType, hasValue } from '@/common/facts';
import type { FactFields } from '@/common/types';

// What a Fact says, as stored.
export interface Said {
  date: string | null;
  place: string | null;
  value: string | null;
  type: string | null;
}

type Read<T> = { ok: T } | { rejected: string };

function textOf(typed: string) {
  const kept = typed.trim();
  return kept === '' ? null : kept;
}

function kindOf(tag: string) {
  return factKindLabel(tag).toLowerCase();
}

// The date as stored: kept as it was when it's typed as the panel shows it,
// so a date of another calendar, or a span, survives an edit of the place;
// else read from what was typed.
function dateOf(typed: string, stored: string | null): Read<string | null> {
  const text = typed.trim();
  if (text === '') return { ok: null };
  if (stored !== null && text === gedcomDate(stored)) return { ok: stored };
  const date = typedDate(text);
  return date === null
    ? { rejected: `Write the date like this: ${TYPED_DATE_FORMS}.` }
    : { ok: date };
}

// An Event's type, which it must have; any other kind's stays as stored.
function typeOf(
  tag: string,
  typed: string,
  stored: string | null
): Read<string | null> {
  if (!hasType(tag)) return { ok: stored };
  const type = textOf(typed);
  return type === null
    ? { rejected: `Say what kind of ${kindOf(tag)} it is.` }
    : { ok: type };
}

// An attribute's value, which it must have. An event's is GEDCOM's "it
// happened" flag when nothing else says so, unless it was stored with
// another.
function valueOf(
  tag: string,
  typed: string,
  { date, place }: { date: string | null; place: string | null },
  stored: string | null
): Read<string | null> {
  if (hasValue(tag)) {
    const value = textOf(typed);
    return value === null
      ? { rejected: `Say what the ${kindOf(tag)} is.` }
      : { ok: value };
  }
  if (stored !== null && stored !== 'Y') return { ok: stored };
  return { ok: date === null && place === null ? 'Y' : null };
}

// What the fields say of a Fact of the kind, given what it says now (null
// for a new one).
export function readFields(
  tag: string,
  fields: FactFields,
  stored: Said | null
): Read<Said> {
  const date = dateOf(fields.date, stored?.date ?? null);
  if ('rejected' in date) return date;
  const type = typeOf(tag, fields.type, stored?.type ?? null);
  if ('rejected' in type) return type;
  const place = textOf(fields.place);
  const at = { date: date.ok, place };
  const value = valueOf(tag, fields.value, at, stored?.value ?? null);
  if ('rejected' in value) return value;
  return { ok: { ...at, value: value.ok, type: type.ok } };
}
