// A NAME's given name, surname and suffix, as `Given /Surname/ Suffix`
// writes them.

const NAME_RE = /^(?<given>[^/]*)\/(?<surname>[^/]*)\/(?<suffix>.*)$/;

interface NameParts {
  given: string | null;
  surname: string | null;
  suffix: string | null;
}

function nullIfEmpty(s: string): string | null {
  return s === '' ? null : s;
}

export function parseName(full: string): NameParts {
  const m = NAME_RE.exec(full);
  if (m === null) {
    return { given: nullIfEmpty(full.trim()), surname: null, suffix: null };
  }
  const g = m.groups!;
  return {
    given: nullIfEmpty(g.given!.trim()),
    surname: nullIfEmpty(g.surname!.trim()),
    suffix: nullIfEmpty(g.suffix!.trim())
  };
}
