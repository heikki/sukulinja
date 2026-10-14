export type BookKind = 'rippi' | 'lasten' | 'kastetut' | 'vihityt';

export interface Years {
  from: number;
  to: number;
}

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

export function bookKind(name: string): BookKind | null {
  if (/lasten/i.test(name)) return 'lasten';
  if (/ripp|pääkirj|kirkonkirj|historiakirj/i.test(name)) return 'rippi';
  if (/synty|kastet/i.test(name)) return 'kastetut';
  if (/vihit|kuulut/i.test(name)) return 'vihityt';
  return null;
}

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
