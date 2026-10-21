// Writing GEDCOM 7 text: the inverse of parseGedcom. A line's level comes
// from where it sits in the tree; a value over several lines continues on
// CONT lines; every line ends in CRLF.

export interface OutLine {
  tag: string;
  xref?: string;
  value?: string;
  // A value that points at a record, written as is.
  pointer?: boolean;
  children: OutLine[];
}

export function line(
  tag: string,
  value?: string | null,
  children: OutLine[] = []
) {
  const out: OutLine = { tag, children };
  if (value !== undefined && value !== null && value !== '') out.value = value;
  return out;
}

export function pointer(tag: string, xref: string, children: OutLine[] = []) {
  return { tag, value: xref, pointer: true, children };
}

// The line for a value, or none when there's no value.
export function optional(tag: string, value: string | null) {
  return value === null || value === '' ? [] : [line(tag, value)];
}

// A value's lines start with @ written as @@ (GEDCOM 7, 1.3.3).
function escape(text: string) {
  return text.startsWith('@') ? `@${text}` : text;
}

function write(out: string[], node: OutLine, level: number) {
  const head = [String(level), ...(node.xref === undefined ? [] : [node.xref])];
  head.push(node.tag);
  if (node.value === undefined) {
    out.push(head.join(' '));
  } else if (node.pointer === true) {
    out.push(`${head.join(' ')} ${node.value}`);
  } else {
    const [first, ...rest] = node.value.split('\n');
    out.push(
      first === '' ? head.join(' ') : `${head.join(' ')} ${escape(first!)}`
    );
    for (const more of rest) {
      out.push(
        more === '' ? `${level + 1} CONT` : `${level + 1} CONT ${escape(more)}`
      );
    }
  }
  for (const child of node.children) write(out, child, level + 1);
}

export function writeGedcom(records: OutLine[]) {
  const out: string[] = [];
  for (const record of records) write(out, record, 0);
  return `\uFEFF${out.join('\r\n')}\r\n`;
}
