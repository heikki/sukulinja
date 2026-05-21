const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?=\/|$)/u;

export function datasetPrefix(): string {
  const m = DATASET_RE.exec(window.location.pathname);
  return m === null ? '' : m[0];
}

export function apiUrl(path: string): string {
  return `${datasetPrefix()}${path}`;
}

export function mediaUrl(storedPath: string): string {
  return `${datasetPrefix()}/media/${storedPath}`;
}
