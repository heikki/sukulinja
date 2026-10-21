// Writing GEDCOM 5.5.1 text from the same lines as GEDCOM 7 (gedcom-writer):
// a line is at most 255 characters with its CRLF, so a longer value goes on
// CONC lines, split between two non-space characters; a new line in a value
// is a CONT line; every `@` in a value is written `@@`.

import type { OutLine } from './gedcom-writer';

// Characters before the CRLF.
const LIMIT = 253;
// Values the grammar gives no CONC, and DATE, whose calendar escapes
// (`@#DJULIAN@`) aren't doubled.
const UNSPLIT = new Set(['FILE', 'PAGE', 'DATE']);

function chars(text: string) {
  return Array.from(text);
}

// Where to cut `cs` to at most `room` characters: between two non-space
// characters, and not inside an `@@`.
function cutOf(cs: string[], room: number) {
  for (let i = room; i > 0; i -= 1) {
    const [a, b] = [cs[i - 1]!, cs[i]!];
    if (a !== ' ' && b !== ' ' && !(a === '@' && b === '@')) return i;
  }
  return room;
}

interface Writing {
  out: string[];
  // Lines over the limit that couldn't be split, by tag.
  long: string[];
}

// `prefix` and its value, the rest of the value on CONC lines at `level`.
function emit(w: Writing, prefix: string, value: string, level: number) {
  if (value === '') {
    w.out.push(prefix);
    return;
  }
  let rest = chars(value);
  let head = prefix;
  for (;;) {
    const room = LIMIT - chars(head).length - 1;
    if (rest.length <= room) {
      w.out.push(`${head} ${rest.join('')}`);
      return;
    }
    const cut = cutOf(rest, room);
    w.out.push(`${head} ${rest.slice(0, cut).join('')}`);
    rest = rest.slice(cut);
    head = `${level} CONC`;
  }
}

function write(w: Writing, node: OutLine, level: number) {
  const prefix = [
    String(level),
    ...(node.xref === undefined ? [] : [node.xref]),
    node.tag
  ].join(' ');
  if (node.value === undefined) {
    w.out.push(prefix);
  } else if (node.pointer === true) {
    w.out.push(`${prefix} ${node.value}`);
  } else if (UNSPLIT.has(node.tag)) {
    const value =
      node.tag === 'DATE' ? node.value : node.value.replaceAll('@', '@@');
    const whole = `${prefix} ${value}`;
    if (chars(whole).length > LIMIT) w.long.push(node.tag);
    w.out.push(whole);
  } else {
    const [first, ...rest] = node.value.replaceAll('@', '@@').split('\n');
    emit(w, prefix, first!, level + 1);
    for (const more of rest) emit(w, `${level + 1} CONT`, more, level + 1);
  }
  for (const child of node.children) write(w, child, level + 1);
}

// The text, and the tags of lines left over the limit, which only FILE and
// PAGE can be.
export function writeGedcom551(records: OutLine[]) {
  const w: Writing = { out: [], long: [] };
  for (const record of records) write(w, record, 0);
  return { text: `\uFEFF${w.out.join('\r\n')}\r\n`, long: w.long };
}
