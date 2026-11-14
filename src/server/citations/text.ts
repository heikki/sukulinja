import type { Years } from '@/common/types';

export type { BookKind, Years } from '@/common/types';

export function decodeEntities(s: string) {
  return s
    .replace(/&#x(?<n>[0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&#(?<n>\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(?<c>[a-z])uml;/gi, (_, c: string) => `${c}\u0308`.normalize())
    .replace(/&aring;/g, 'å')
    .replace(/&Aring;/g, 'Å')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export { bookKind } from '@/common/books';

export function yearRange(s: string): Years | null {
  const range = /(?<from>1[5-9]\d\d)\s*-\s*(?<to>1[5-9]\d\d)/.exec(s)?.groups;
  if (range !== undefined) {
    return { from: Number(range.from), to: Number(range.to) };
  }
  const one = /\b(?<y>1[5-9]\d\d)\b/.exec(s)?.groups;
  return one === undefined ? null : { from: Number(one.y), to: Number(one.y) };
}

export function stripParens(s: string) {
  return s.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

// Some citations are HTML, some escaped once more on top of that.
export function decodeFully(raw: string) {
  let text = raw;
  for (let prev = ''; prev !== text;) {
    prev = text;
    text = decodeEntities(text);
  }
  return text;
}

export function stripTags(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
}

export function citationText(raw: string) {
  return stripTags(decodeFully(raw));
}

// The text with its lines tidied: spaces collapsed, blank lines dropped;
// null for none.
export function plainText(text: string | null) {
  const lines = (text ?? '')
    .split('\n')
    .map((l) => l.replaceAll(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
  return lines.length === 0 ? null : lines.join('\n');
}
