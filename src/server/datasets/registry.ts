// The datasets in the data folder, and everything done to one as a whole:
// listing, importing (merging into the one under its slug), undoing that
// import, exporting and deleting. A dataset's meta is read and written only
// here.

import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { DatasetInfo, PersonName } from '@/common/types';

import { saveExport } from '../export/dataset';
import { buildImport } from '../import/dataset';
import type { ImportRequest } from '../import/dataset';
import { createRecords } from '../persons/records';
import { openAnyDb, openDb, OutdatedDatasetError } from './db';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/u;
// The database from before the last import, kept for Undo last import.
function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid dataset slug: ${JSON.stringify(slug)}`);
  }
}

// No dataset is stored under the slug.
export class DatasetNotFound extends Error {
  constructor(slug: string) {
    super(`dataset not found: ${slug}`);
  }
}

// An import under a name a dataset already has.
export class DatasetExists extends Error {
  constructor(name: string) {
    super(
      `There's a dataset named ${name} already. Import this under another name.`
    );
  }
}

interface StagingDataset {
  db: Database;
  mediaDir: string;
  // Atomically swap the staged dataset into place under its slug, replacing any
  // existing one, whose database is kept to undo the import with. Closes the
  // staged handle; the next open() reopens fresh.
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

  // Whether there's a dataset under the slug, outdated or not.
  has(slug: string) {
    validateSlug(slug);
    return existsSync(this.datasetDir(slug));
  }

  mediaDir(slug: string): string {
    validateSlug(slug);
    return join(this.datasetDir(slug), 'media');
  }

  // Close any open handle and remove the dataset from disk. Returns false if no
  // dataset by that slug existed.
  async delete(slug: string): Promise<boolean> {
    validateSlug(slug);
    const dir = this.datasetDir(slug);
    this.forget(slug);
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

  // Imports a GEDCOM or GEDZIP as a new dataset under its slug; one there
  // already is never replaced, as its tree is edited in the app
  // (ADR-0021). Built off to the side, so readers see the whole import or
  // nothing.
  async import(req: ImportRequest) {
    if (this.has(req.slug)) {
      throw new DatasetExists(req.displayName ?? req.slug);
    }
    const staging = await this.createStaging(req.slug);
    try {
      const built = await buildImport(staging, req);
      writeMeta(staging.db, {
        display_name: req.displayName ?? req.slug,
        source_filename: req.sourceFilename,
        imported_at: new Date().toISOString(),
        gedcom_version: built.gedcomVersion
      });
      req.log?.('Finishing…');
      await staging.commit();
      const info = this.readAny(req.slug, (db) =>
        readInfo(db!, req.slug, null)
      );
      return { ...built, info };
    } catch (err) {
      await staging.discard();
      throw err;
    }
  }

  // Starts a new dataset under its slug with its first person, the only
  // one made in no place in the tree, as there's no tree yet; the chart
  // starts from them. Their id, and the dataset as listed.
  async create(req: { slug: string; displayName: string; first: PersonName }) {
    if (this.has(req.slug)) throw new DatasetExists(req.displayName);
    const staging = await this.createStaging(req.slug);
    try {
      const { given, surname, sex } = req.first;
      const personId = createRecords(staging.db).person(
        { given: given.trim(), surname: surname.trim() },
        sex
      );
      writeMeta(staging.db, { display_name: req.displayName });
      await staging.commit();
      const info = this.readAny(req.slug, (db) =>
        readInfo(db!, req.slug, null)
      );
      return { personId, info };
    } catch (err) {
      await staging.discard();
      throw err;
    }
  }

  // Saves the dataset as a GEDZIP into `dir` (Downloads by default), and
  // says where.
  async export(slug: string, options: { dir?: string } = {}) {
    return await saveExport(
      { slug, db: this.open(slug), mediaDir: this.mediaDir(slug) },
      options
    );
  }

  // Build a dataset by hand, as a test does, off to the side in a hidden
  // staging dir (the dot prefix keeps it out of list()) and only swap it into
  // place on commit.
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
        this.forget(slug);
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
      const info = this.info(e.name);
      if (info !== null) out.push(info);
    }
    out.sort((a, b) => a.slug.localeCompare(b.slug));
    return out;
  }

  // The dataset under the slug, outdated or not; null when none can be read.
  info(slug: string) {
    validateSlug(slug);
    const by = this.outdatedBy(slug);
    if (by === null) {
      try {
        return readInfo(this.open(slug), slug, null);
      } catch {
        return null;
      }
    }
    return this.readAny(slug, (db) => {
      if (db === null) return null;
      try {
        return readInfo(db, slug, by);
      } catch {
        return null;
      }
    });
  }

  // Which version built the dataset, when it won't open for that; null
  // when it opens, or fails for another reason.
  private outdatedBy(slug: string) {
    try {
      this.open(slug);
      return null;
    } catch (err) {
      return err instanceof OutdatedDatasetError ? err.by : null;
    }
  }

  // The dataset's database. Throws DatasetNotFound, or OutdatedDatasetError
  // for one an older version built.
  open(slug: string): Database {
    validateSlug(slug);
    const cached = this.cache.get(slug);
    if (cached !== undefined) return cached;
    const dbPath = join(this.datasetDir(slug), 'db.sqlite');
    if (!existsSync(dbPath)) throw new DatasetNotFound(slug);
    const db = openDb(dbPath);
    this.cache.set(slug, db);
    return db;
  }

  // Closes the dataset's open database, which is about to be replaced.
  private forget(slug: string) {
    this.cache.get(slug)?.close();
    this.cache.delete(slug);
  }

  // Reads the dataset's database, read-only and whatever version built it;
  // null when there's none or it can't be opened.
  private readAny<T>(slug: string, read: (db: Database | null) => T) {
    const dbPath = join(this.datasetDir(slug), 'db.sqlite');
    let db: Database | null = null;
    try {
      if (existsSync(dbPath)) db = openAnyDb(dbPath);
    } catch {
      db = null;
    }
    try {
      return read(db);
    } finally {
      db?.close();
    }
  }

  private datasetDir(slug: string): string {
    return join(this.root, slug);
  }
}

// The media folder beside a dataset's open database, as mediaDir() names
// it by the dataset's slug.
export function mediaDirOf(db: Database): string {
  return join(dirname(db.filename), 'media');
}

// The dataset's meta, by key; a null value isn't written.
function writeMeta(db: Database, meta: Record<string, string | null>) {
  const write = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(meta)) {
    if (value !== null) write.run(key, value);
  }
}

function readInfo(
  db: Database,
  slug: string,
  outdated: DatasetInfo['outdated']
) {
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
    sourceFilename: meta.get('source_filename') ?? null,
    outdated
  };
}
