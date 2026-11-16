import { isAbsolute, relative } from 'node:path';

// Whether `path` is `dir` or somewhere under it, on any system: a relative
// path that climbs out starts with `..` and a separator (`/` or `\`), and one
// on another Windows drive comes back absolute.
export function isInside(dir: string, path: string) {
  const rel = relative(dir, path);
  return rel !== '..' && !/^\.\.[/\\]/u.test(rel) && !isAbsolute(rel);
}
