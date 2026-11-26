// A MyHeritage record's transcription as an Entry's text, as converting
// its reference saves it (ADR-0026).

import type { RecordView } from './types';

// Whom it's about, its fields, then its household's rows, as plain lines.
export function plainRecord({ name, fields, household }: RecordView) {
  const rows = household.map((m) =>
    [m.relation, m.name, m.born].filter((x) => x !== null).join('; ')
  );
  const lines = [name, ...fields.map((f) => `${f.label}: ${f.value}`), ...rows];
  const text = lines.filter((l) => l !== '').join('\n');
  return text === '' ? null : text;
}
