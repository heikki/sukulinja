export interface UploadMedia {
  file: File;
  relPath: string;
}

export function stripExtension(name: string): string {
  return name.replace(/\.ged(?:com)?$/iu, '');
}

// The directory portion of a webkitRelativePath ('a/b/c.jpg' -> 'a/b').
export function folderOf(relativePath: string): string {
  const i = relativePath.lastIndexOf('/');
  return i === -1 ? '' : relativePath.slice(0, i);
}

// A picked file's path relative to the GEDCOM's own folder, or null if it sits
// outside that folder (so GEDCOM-relative media references resolve correctly).
export function relativeToBase(
  relativePath: string,
  base: string
): string | null {
  if (base === '') return relativePath;
  const prefix = `${base}/`;
  return relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : null;
}
