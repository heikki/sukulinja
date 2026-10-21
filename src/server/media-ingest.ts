import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

import type { GedNode } from './gedcom-parser';
import { allMediaRefs, localPaths } from './media-refs';
import { runPool } from './pool';

// Each worker reads a whole file into memory to hash it, so keep the in-flight
// count well under the OS file-handle limit and bounded in memory.
const DEFAULT_CONCURRENCY = 8;

type SkipReason = 'absolute' | 'missing';

export interface IngestSkipped {
  originalRelpath: string;
  reason: SkipReason;
}

interface IngestResult {
  resolved: Map<string, string>;
  skipped: IngestSkipped[];
}

interface IngestInput {
  roots: GedNode[];
  sourceDir: string;
  targetDir: string;
  concurrency?: number;
  log?: (msg: string) => void;
}

async function storeFile(
  sourceAbsPath: string,
  targetDir: string
): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(sourceAbsPath).arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const ext = extname(sourceAbsPath).toLowerCase();
  const name = `${hash}${ext}`;
  const target = join(targetDir, name);
  if (!(await Bun.file(target).exists())) {
    await Bun.write(target, bytes);
  }
  return name;
}

const WIN_ABS_RE = /^[A-Za-z]:[\\/]/u;

// The file these FILEs name under `sourceDir`, if there is one. A FILE that
// climbs out of it names nothing: an uploaded GEDCOM mustn't copy files from
// elsewhere on the disk into a dataset.
async function existing(sourceDir: string, relpaths: string[]) {
  const inside = relpaths
    .flatMap(localPaths)
    .map((path) => resolve(sourceDir, path))
    .filter((abs) => {
      const rel = relative(sourceDir, abs);
      return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
    });
  const found = await Promise.all(inside.map((abs) => Bun.file(abs).exists()));
  return inside.find((_, i) => found[i] === true) ?? null;
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
  // What gedcom-import links, so every file copied gets a media row.
  const refs = allMediaRefs(input.roots).map((r) => r.path);
  const resolved = new Map<string, string>();
  const skipped: IngestSkipped[] = [];
  if (refs.length === 0) return { resolved, skipped };

  await mkdir(input.targetDir, { recursive: true });

  const seen = new Set<string>();
  const sourceToRelpaths = new Map<string, string[]>();
  for (const relpath of refs) {
    if (seen.has(relpath)) continue;
    seen.add(relpath);
    if (relpath.startsWith('/') || WIN_ABS_RE.test(relpath)) {
      skipped.push({ originalRelpath: relpath, reason: 'absolute' });
      continue;
    }
    const sourceAbsPath = resolve(input.sourceDir, relpath);
    let arr = sourceToRelpaths.get(sourceAbsPath);
    if (arr === undefined) {
      arr = [];
      sourceToRelpaths.set(sourceAbsPath, arr);
    }
    arr.push(relpath);
  }

  const log = input.log ?? (() => undefined);
  const entries = [...sourceToRelpaths.entries()];
  log(`Storing ${entries.length} media files…`);
  let done = 0;
  await runPool(
    entries,
    input.concurrency ?? DEFAULT_CONCURRENCY,
    async ([, relpaths]) => {
      const source = await existing(input.sourceDir, relpaths);
      if (source === null) {
        for (const r of relpaths) {
          skipped.push({ originalRelpath: r, reason: 'missing' });
        }
      } else {
        const name = await storeFile(source, input.targetDir);
        for (const r of relpaths) resolved.set(r, name);
      }
      done += 1;
      if (done % 25 === 0 || done === entries.length) {
        log(`Stored ${done}/${entries.length} media files`);
      }
    }
  );

  return { resolved, skipped };
}
