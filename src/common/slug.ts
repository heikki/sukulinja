// A GEDCOM's or GEDZIP's file name without its extension.
export function withoutExtension(name: string) {
  return name.replace(/\.(?:ged(?:com)?|gdz)$/iu, '');
}

// Derive a dataset slug from a filename or a user-typed name. Shared by the
// import pipeline (server) and the import dialog (client) so the name the user
// sees previewed is exactly the slug the server will store under.
export function slugFromFilename(name: string): string {
  return withoutExtension(name)
    .normalize('NFD') // split accented letters into base + combining mark
    .replace(/\p{Diacritic}/gu, '') // ä -> a, ö -> o, å -> a, é -> e, …
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}
