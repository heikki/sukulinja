const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');

// A day, month and year the Finnish way, as precise as it's given:
// "3.3.1761", "3/1761", "1761".
function dayMonthYear(day: number | null, month: number | null, year: string) {
  if (month === null) return year;
  return day === null ? `${month}/${year}` : `${day}.${month}.${year}`;
}

// "1761-03-03", or its month or year alone.
export function isoDate(date: string) {
  const [year = '', month, day] = date.split('-');
  return dayMonthYear(
    day === undefined ? null : Number(day),
    month === undefined ? null : Number(month),
    year
  );
}

// A GEDCOM date: "[day] [month] year", e.g. "3 MAR 1761". Null when it isn't
// one, such as another calendar's.
function gedcomDay(text: string) {
  const m =
    /^(?:(?:(?<day>\d{1,2}) )?(?<name>[A-Z]{3}) )?(?<year>\d{3,4})$/.exec(text);
  if (m?.groups === undefined) return null;
  const { day, name, year = '' } = m.groups;
  if (name === undefined) return year;
  const month = MONTHS.indexOf(name) + 1;
  if (month === 0) return null;
  return dayMonthYear(day === undefined ? null : Number(day), month, year);
}

const QUALIFIED: Array<[RegExp, (a: string, b: string) => string]> = [
  [/^BET (?<a>.+) AND (?<b>.+)$/, (a, b) => `${a}–${b}`],
  [/^FROM (?<a>.+) TO (?<b>.+)$/, (a, b) => `${a}–${b}`],
  [/^FROM (?<a>.+)$/, (a) => `${a}–`],
  [/^TO (?<a>.+)$/, (a) => `–${a}`],
  [/^ABT (?<a>.+)$/, (a) => `n. ${a}`],
  [/^CAL (?<a>.+)$/, (a) => `n. ${a}`],
  [/^EST (?<a>.+)$/, (a) => `n. ${a}`],
  [/^BEF (?<a>.+)$/, (a) => `ennen ${a}`],
  [/^AFT (?<a>.+)$/, (a) => `${a} jälkeen`]
];

// A fact's GEDCOM date the Finnish way: "12 MAR 1850" as "12.3.1850",
// "BET 1867 AND 1879" as "1867–1879", "ABT 1850" as "n. 1850". One it can't
// read stays as recorded.
export function gedcomDate(text: string) {
  const date = text.trim().toUpperCase();
  for (const [re, write] of QUALIFIED) {
    const groups = re.exec(date)?.groups;
    if (groups === undefined) continue;
    const a = gedcomDay(groups.a ?? '');
    const b = groups.b === undefined ? '' : gedcomDay(groups.b);
    return a === null || b === null ? text : write(a, b);
  }
  return gedcomDay(date) ?? text;
}

// A day, month and year typed the Finnish way, as GEDCOM writes it: "3.3.1761"
// as "3 MAR 1761", "3/1761" as "MAR 1761". Null when it isn't one, or isn't
// a day of the calendar.
function typedDay(text: string) {
  const m =
    /^(?:(?:(?<day>\d{1,2})\.)?(?<month>\d{1,2})[./])?(?<year>\d{3,4})$/.exec(
      text
    );
  if (m?.groups === undefined) return null;
  const { day, month, year = '' } = m.groups;
  if (month === undefined) return year;
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) return null;
  if (day === undefined) return `${name} ${year}`;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(day) < 1 || Number(day) > days) return null;
  return `${Number(day)} ${name} ${year}`;
}

const TYPED: Array<[RegExp, (a: string, b: string) => string]> = [
  [/^(?<a>[^–-]+?)\s*[–-]\s*(?<b>[^–-]+)$/, (a, b) => `BET ${a} AND ${b}`],
  [/^(?<a>[^–-]+?)\s*[–-]$/, (a) => `FROM ${a}`],
  [/^[–-]\s*(?<a>[^–-]+)$/, (a) => `TO ${a}`],
  [/^n\.\s*(?<a>.+)$/i, (a) => `ABT ${a}`],
  [/^ennen\s+(?<a>.+)$/i, (a) => `BEF ${a}`],
  [/^(?<a>.+?)\s+jälkeen$/i, (a) => `AFT ${a}`]
];

// A date typed the way the panel shows one, as GEDCOM 7 stores it:
// "3.3.1761", "3/1761", "1761", "n. 1761", "ennen 1761", "1761 jälkeen",
// "1870–1879" (or with a hyphen), "1870–" and "–1879". Null when it's none
// of these. A span reads back as a range ("BET … AND …"), the more common.
export function typedDate(text: string) {
  const date = text.trim().replaceAll(/\s+/g, ' ');
  for (const [re, write] of TYPED) {
    const groups = re.exec(date)?.groups;
    if (groups === undefined) continue;
    const a = typedDay(groups.a ?? '');
    const b = groups.b === undefined ? '' : typedDay(groups.b);
    return a === null || b === null ? null : write(a, b);
  }
  return typedDay(date);
}

// The forms typedDate reads, for saying so when it can't.
export const TYPED_DATE_FORMS =
  '3.3.1761, 3/1761, 1761, n. 1761, ennen 1761, 1761 jälkeen, 1870–1879';

// A GEDCOM date as a number that sorts by when it was: the first day it
// names, "BET 1867 AND 1879" as 1867, a missing month or day as before
// any. Null when it names no year.
export function dateOrder(text: string) {
  const m =
    /(?:^|\s)(?:(?<day>\d{1,2}) )?(?:(?<name>[A-Z]{3}) )?(?<year>\d{3,4})(?:\s|$)/.exec(
      text.trim().toUpperCase()
    );
  if (m?.groups === undefined) return null;
  const { day = '0', name, year = '' } = m.groups;
  const month = name === undefined ? 0 : MONTHS.indexOf(name) + 1;
  return Number(year) * 10000 + month * 100 + Number(day);
}

// The first and last day a GEDCOM date can be, as dateOrder numbers them:
// "1761" all of 1761, "MAR 1761" its March, "3 MAR 1761" that day, "ABT
// 1761" (CAL, EST) as 1761, "BET 1760 AND 1762" (FROM … TO) from the
// first to the last, "BEF 1761" (TO) any day up to it, "AFT 1761" (FROM)
// any day after. Null when it can't be read.
export function dateSpan(text: string): [number, number] | null {
  const date = text.trim().toUpperCase();
  return spanOfTwo(date) ?? spanOfOne(date);
}

// A span between two dates; undefined for any other date.
function spanOfTwo(date: string): [number, number] | null | undefined {
  const two = /^(?:BET (?<a>.+) AND|FROM (?<c>.+) TO) (?<b>.+)$/.exec(date);
  if (two?.groups === undefined) return undefined;
  const a = daySpan(two.groups.a ?? two.groups.c ?? '');
  const b = daySpan(two.groups.b ?? '');
  return a === null || b === null ? null : [a[0], b[1]];
}

// A date alone, or with a word before it.
function spanOfOne(date: string): [number, number] | null {
  const one = /^(?<q>ABT|CAL|EST|BEF|TO|AFT|FROM) (?<a>.+)$/.exec(date);
  if (one?.groups === undefined) return daySpan(date);
  const a = daySpan(one.groups.a ?? '');
  if (a === null) return null;
  const q = one.groups.q;
  if (q === 'BEF' || q === 'TO') return [-Infinity, a[1]];
  if (q === 'AFT' || q === 'FROM') return [a[0], Infinity];
  return a;
}

// A day, month or year's first and last day.
function daySpan(text: string): [number, number] | null {
  const m =
    /^(?:(?:(?<day>\d{1,2}) )?(?<name>[A-Z]{3}) )?(?<year>\d{3,4})$/.exec(text);
  if (m?.groups === undefined) return null;
  const { day, name, year = '' } = m.groups;
  const y = Number(year) * 10000;
  if (name === undefined) return [y + 101, y + 1231];
  const month = MONTHS.indexOf(name) + 1;
  if (month === 0) return null;
  const at = y + month * 100;
  return day === undefined
    ? [at + 1, at + 31]
    : [at + Number(day), at + Number(day)];
}
