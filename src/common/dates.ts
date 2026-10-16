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
