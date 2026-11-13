// What a Transcription says happened, read from its fields: a MyHeritage
// record's as `record.ts` reads them, or a converted Citation's plain
// `Label: value` lines (ADR-0016). Nothing here reads MyHeritage's own
// markup, so it stays when `myheritage/` goes.

import type { RecordField } from '@/common/types';

// An event a Transcription gives, by the Fact tag it would be, with the
// date as precise as it's written: YYYY-MM-DD, YYYY-MM or YYYY.
export interface TranscribedEvent {
  tag: string;
  date: string;
}

// The labels that name an event, and the Fact each would be. Residence
// ("Asuinpaikka") isn't one: its years are the book's.
const EVENT_LABELS: Record<string, string> = {
  Syntymäpäivä: 'BIRT',
  Syntymäaika: 'BIRT',
  Syntymä: 'BIRT',
  Ristiäiset: 'CHR',
  Kaste: 'CHR',
  Kuolinpäivä: 'DEAT',
  Kuolema: 'DEAT',
  Hautaus: 'BURI',
  Avioliitto: 'MARR'
};

const MONTHS = [
  'tammi',
  'helmi',
  'maalis',
  'huhti',
  'touko',
  'kesä',
  'heinä',
  'elo',
  'syys',
  'loka',
  'marras',
  'joulu'
];

// "29. Marras 1829" → "1829-11-29", "Marras 1829" → "1829-11", "1829" →
// "1829": Finnish month names, as MyHeritage writes them, sometimes with
// the "-kuu" ending. Null with no year.
export function transcribedDate(text: string) {
  const m =
    /(?:(?<day>\d{1,2})\.\s*)?(?:(?<month>\p{L}+)\s+)?(?<year>1[5-9]\d\d)/u.exec(
      text
    )?.groups;
  if (m === undefined) return null;
  const word = m.month?.toLowerCase();
  const month = MONTHS.findIndex((name) => word?.startsWith(name) === true);
  if (month < 0) return m.year!;
  const ym = `${m.year}-${String(month + 1).padStart(2, '0')}`;
  return m.day === undefined ? ym : `${ym}-${m.day.padStart(2, '0')}`;
}

// A converted Citation's text, one `Label: value` a line, as fields. The
// first line, the name, and the household rows have no label.
export function plainFields(text: string | null): RecordField[] {
  if (text === null) return [];
  return text.split('\n').flatMap((line) => {
    const m = /^(?<label>[^:;]+):\s*(?<value>.+)$/.exec(line.trim())?.groups;
    return m === undefined
      ? []
      : [{ label: m.label!.trim(), value: m.value!.trim() }];
  });
}

// The events the fields give, the first of each kind: a value with no year
// gives none. An index entry writes its place after the date
// ("29. Marras 1829 - Mikkeli, …"); only the date is read.
export function transcriptionEvents(fields: RecordField[]) {
  const events: TranscribedEvent[] = [];
  for (const { label, value } of fields) {
    const tag = EVENT_LABELS[label];
    if (tag === undefined || events.some((e) => e.tag === tag)) continue;
    const date = transcribedDate(value.split(/\s+-\s+/)[0]!);
    if (date !== null) events.push({ tag, date });
  }
  return events;
}
