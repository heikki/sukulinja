// The install's parishes as the app's server keeps them, outside any
// dataset: finding a parish's archive in Astia, and choosing one.

import type { ChurchBookArchive } from '@/common/types';

async function answer(res: Response) {
  if (!res.ok) throw new Error(await res.text());
  return res;
}

async function post(path: string, body: unknown) {
  await answer(
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}

// Every parish, by its archive's title in Astia.
export async function fetchParishes() {
  const res = await answer(await fetch('/parishes'));
  return (await res.json()) as ChurchBookArchive[];
}

// The parish archives whose titles start most like `name`, best first.
export async function findArchives(name: string, signal?: AbortSignal) {
  const q = encodeURIComponent(name);
  const res = await answer(await fetch(`/parishes/search?q=${q}`, { signal }));
  return (await res.json()) as ChurchBookArchive[];
}

// Every reference giving the spelling links into the archive from now on.
export async function linkSpelling(spelling: string, archiveId: string) {
  await post('/parishes/spellings', { spelling, archiveId });
}

// The archive joins the install's parishes, with no spelling.
export async function addParish(archiveId: string) {
  await post('/parishes', { archiveId });
}
