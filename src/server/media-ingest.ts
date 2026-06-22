import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import { findChildren, type GedNode } from './gedcom-parser';
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

function collectFileRefs(roots: GedNode[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (root.tag !== 'INDI' && root.tag !== 'FAM') continue;
    for (const child of root.children) {
      if (child.tag !== 'OBJE') continue;
      for (const file of findChildren(child, 'FILE')) {
        const v = file.value;
        if (v !== undefined && v !== '') out.push(v);
      }
    }
  }
  return out;
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

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const refs = collectFileRefs(input.roots);
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
    async ([sourceAbsPath, relpaths]) => {
      if (await Bun.file(sourceAbsPath).exists()) {
        const name = await storeFile(sourceAbsPath, input.targetDir);
        for (const r of relpaths) resolved.set(r, name);
      } else {
        for (const r of relpaths) {
          skipped.push({ originalRelpath: r, reason: 'missing' });
        }
      }
      done += 1;
      if (done % 25 === 0 || done === entries.length) {
        log(`Stored ${done}/${entries.length} media files`);
      }
    }
  );

  return { resolved, skipped };
}
