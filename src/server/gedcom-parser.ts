export interface GedNode {
  level: number;
  xref?: string;
  tag: string;
  value?: string;
  children: GedNode[];
}

interface ParsedLine {
  level: number;
  xref: string | undefined;
  tag: string;
  value: string | undefined;
}

const LINE_RE =
  /^(?<level>\d+)\s+(?:(?<xref>@[^@]+@)\s+)?(?<tag>[A-Za-z_0-9]+)(?:\s(?<value>.*))?$/;

export function parseGedcom(text: string): GedNode[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r\n|\n|\r/);
  const roots: GedNode[] = [];
  const stack: GedNode[] = [];

  function appendConcCont({ level, tag, value }: ParsedLine): void {
    const parent = stack[level - 1];
    if (parent === undefined) return;
    parent.value ??= '';
    parent.value += (tag === 'CONT' ? '\n' : '') + (value ?? '');
  }

  function addNode({ level, xref, tag, value }: ParsedLine): void {
    const node: GedNode = { level, tag, children: [] };
    if (xref !== undefined) node.xref = xref;
    if (value !== undefined) node.value = value;
    if (level === 0) {
      roots.push(node);
    } else {
      const parent = stack[level - 1];
      if (parent !== undefined) parent.children.push(node);
    }
    stack[level] = node;
    stack.length = level + 1;
  }

  // MyHeritage writes raw newlines inside TEXT values, so some lines carry no
  // level number. They continue the deepest open value, as a CONT would.
  function appendStray(raw: string): void {
    const node = stack.at(-1);
    if (node === undefined) return;
    node.value = `${node.value ?? ''}\n${raw.trim()}`;
  }

  for (const raw of lines) {
    if (raw === '') continue;
    const m = LINE_RE.exec(raw);
    if (m === null) {
      appendStray(raw);
      continue;
    }
    const g = m.groups!;
    const line: ParsedLine = {
      level: parseInt(g.level!, 10),
      xref: g.xref,
      tag: g.tag!,
      value: g.value
    };
    if (line.tag === 'CONC' || line.tag === 'CONT') {
      appendConcCont(line);
    } else {
      addNode(line);
    }
  }

  unescapeAts(roots);
  return roots;
}

function isVersion7(roots: GedNode[]) {
  const head = roots.find((r) => r.tag === 'HEAD');
  const gedc = head?.children.find((c) => c.tag === 'GEDC');
  const vers = gedc?.children.find((c) => c.tag === 'VERS');
  return vers?.value?.startsWith('7') === true;
}

// A value's @ is written @@: everywhere in it in GEDCOM 5.5.1, and only at
// the start of each line in GEDCOM 7.
function unescapeAts(roots: GedNode[]) {
  const v7 = isVersion7(roots);
  function unescape(value: string) {
    if (!v7) return value.replaceAll('@@', '@');
    return value
      .split('\n')
      .map((line) => (line.startsWith('@@') ? line.slice(1) : line))
      .join('\n');
  }
  const pending = [...roots];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.value?.includes('@@') === true) node.value = unescape(node.value);
    pending.push(...node.children);
  }
}

export function findChild(node: GedNode, tag: string): GedNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

export function findChildren(node: GedNode, tag: string): GedNode[] {
  return node.children.filter((c) => c.tag === tag);
}

export function childValue(node: GedNode, tag: string): string | null {
  return findChild(node, tag)?.value ?? null;
}
