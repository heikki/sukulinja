import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import type { DatasetInfo } from '@common/types';

import { openAnyDb, openDb, OutdatedDatasetError } from './db';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/u;

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid dataset slug: ${JSON.stringify(slug)}`);
  }
}

interface FreshDataset {
  db: Database;
  mediaDir: string;
}

export interface StagingDataset {
  db: Database;
  mediaDir: string;
  // Atomically swap the staged dataset into place under its slug, replacing any
  // existing one. Closes the staged handle; the next open() reopens fresh.
  commit: () => Promise<void>;
  // Throw the staged dataset away without publishing it.
  discard: () => Promise<void>;
}

export class DatasetRegistry {
  readonly root: string;
  private readonly cache = new Map<string, Database>();

  constructor(root: string) {
    this.root = resolve(root);
  }

  mediaDir(slug: string): string {
    validateSlug(slug);
    return join(this.datasetDir(slug), 'media');
  }

  async createFresh(slug: string): Promise<FreshDataset> {
    validateSlug(slug);
    const dir = this.datasetDir(slug);
    const cached = this.cache.get(slug);
    if (cached !== undefined) {
      cached.close();
      this.cache.delete(slug);
    }
    await rm(dir, { recursive: true, force: true });
    const mediaDir = join(dir, 'media');
    await mkdir(mediaDir, { recursive: true });
    const db = openDb(join(dir, 'db.sqlite'));
    this.cache.set(slug, db);
    return { db, mediaDir };
  }

  // Close any open handle and remove the dataset from disk. Returns false if no
  // dataset by that slug existed.
  async delete(slug: string): Promise<boolean> {
    validateSlug(slug);
    const dir = this.datasetDir(slug);
    const cached = this.cache.get(slug);
    if (cached !== undefined) {
      cached.close();
      this.cache.delete(slug);
    }
    if (!existsSync(dir)) return false;
    await rm(dir, { recursive: true, force: true });
    return true;
  }

  // Remove staging dirs orphaned by an import that was killed before it could
  // commit or discard (a crash, or a dev hot-reload mid-import). Safe to call at
  // startup, when no import is in flight. Named with a leading dot, so this
  // never touches a real dataset dir.
  async sweepStaging(): Promise<void> {
    if (!existsSync(this.root)) return;
    const entries = await readdir(this.root, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith('.staging-'))
        .map((e) =>
          rm(join(this.root, e.name), { recursive: true, force: true })
        )
    );
  }

  // Build a dataset off to the side in a hidden staging dir (the dot prefix
  // keeps it out of list(), so a half-finished or interrupted import is never
  // visible) and only swap it into place on commit. This makes imports atomic:
  // readers see either the previous dataset or the fully imported one.
  async createStaging(slug: string): Promise<StagingDataset> {
    validateSlug(slug);
    const finalDir = this.datasetDir(slug);
    await mkdir(this.root, { recursive: true });
    const stagingDir = await mkdtemp(join(this.root, '.staging-'));
    const mediaDir = join(stagingDir, 'media');
    await mkdir(mediaDir, { recursive: true });
    const db = openDb(join(stagingDir, 'db.sqlite'));

    let settled = false;
    function closeOnce(): void {
      if (settled) return;
      settled = true;
      db.close();
    }
    return {
      db,
      mediaDir,
      commit: async () => {
        closeOnce();
        const cached = this.cache.get(slug);
        if (cached !== undefined) {
          cached.close();
          this.cache.delete(slug);
        }
        await rm(finalDir, { recursive: true, force: true });
        await rename(stagingDir, finalDir);
      },
      discard: async () => {
        closeOnce();
        await rm(stagingDir, { recursive: true, force: true });
      }
    };
  }

  async list(): Promise<DatasetInfo[]> {
    if (!existsSync(this.root)) return [];
    const entries = await readdir(this.root, { withFileTypes: true });
    const out: DatasetInfo[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!SLUG_RE.test(e.name)) continue;
      const info = this.tryReadInfo(e.name);
      if (info !== null) out.push(info);
    }
    out.sort((a, b) => a.slug.localeCompare(b.slug));
    return out;
  }

  open(slug: string): Database {
    validateSlug(slug);
    const cached = this.cache.get(slug);
    if (cached !== undefined) return cached;
    const dbPath = join(this.datasetDir(slug), 'db.sqlite');
    if (!existsSync(dbPath)) {
      throw new Error(`dataset not found: ${slug}`);
    }
    const db = openDb(dbPath);
    this.cache.set(slug, db);
    return db;
  }

  // The dataset's database, read-only and whatever version built it, for
  // what an import carries over from it; null when there is none. The
  // caller closes it.
  readAny(slug: string): Database | null {
    validateSlug(slug);
    const dbPath = join(this.datasetDir(slug), 'db.sqlite');
    if (!existsSync(dbPath)) return null;
    try {
      return openAnyDb(dbPath);
    } catch {
      return null;
    }
  }

  private datasetDir(slug: string): string {
    return join(this.root, slug);
  }

  private tryReadInfo(slug: string): DatasetInfo | null {
    try {
      return readInfo(this.open(slug), slug, false);
    } catch (err) {
      if (!(err instanceof OutdatedDatasetError)) return null;
    }
    const db = this.readAny(slug);
    if (db === null) return null;
    try {
      return readInfo(db, slug, true);
    } catch {
      return null;
    } finally {
      db.close();
    }
  }
}

function readInfo(db: Database, slug: string, outdated: boolean) {
  const meta = new Map<string, string>(
    db
      .query<{ key: string; value: string }, []>('SELECT key, value FROM meta')
      .all()
      .map((r) => [r.key, r.value])
  );
  function count(table: string) {
    return (
      db
        .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`)
        .get() ?? { n: 0 }
    ).n;
  }
  return {
    slug,
    displayName: meta.get('display_name') ?? slug,
    personCount: count('persons'),
    familyCount: count('families'),
    importedAt: meta.get('imported_at') ?? null,
    outdated
  };
}
