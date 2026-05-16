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

  for (const raw of lines) {
    if (raw === '') continue;
    const m = LINE_RE.exec(raw);
    if (m === null) continue;
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

  return roots;
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
