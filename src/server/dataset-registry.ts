import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import { openDb } from './db';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/u;

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid dataset slug: ${JSON.stringify(slug)}`);
  }
}

export interface FreshDataset {
  db: Database;
  mediaDir: string;
}

export interface DatasetInfo {
  slug: string;
  displayName: string;
  personCount: number;
  familyCount: number;
  importedAt: string | null;
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

  private datasetDir(slug: string): string {
    return join(this.root, slug);
  }

  private tryReadInfo(slug: string): DatasetInfo | null {
    try {
      const db = this.open(slug);
      const meta = new Map<string, string>(
        db
          .query<{ key: string; value: string }, []>(
            'SELECT key, value FROM meta'
          )
          .all()
          .map((r) => [r.key, r.value])
      );
      const personCount = (
        db
          .query<{ n: number }, []>('SELECT COUNT(*) AS n FROM persons')
          .get() ?? { n: 0 }
      ).n;
      const familyCount = (
        db
          .query<{ n: number }, []>('SELECT COUNT(*) AS n FROM families')
          .get() ?? { n: 0 }
      ).n;
      return {
        slug,
        displayName: meta.get('display_name') ?? slug,
        personCount,
        familyCount,
        importedAt: meta.get('imported_at') ?? null
      };
    } catch {
      return null;
    }
  }
}
