// The pages typed: one, or a spread's two following each other ("4-5"),
// or none for an Image without a page number; null for anything else.
export function typedPages(text: string): number[] | null {
  if (text.trim() === '') return [];
  const parts = text.trim().split(/\s*[-–\s]\s*/u);
  const pages = parts.map(Number);
  if (!pages.every((p) => Number.isInteger(p) && p > 0)) return null;
  if (pages.length === 1) return pages;
  return pages.length === 2 && pages[1] === pages[0]! + 1 ? pages : null;
}
