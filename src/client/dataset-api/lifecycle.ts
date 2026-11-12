// What the chooser asks the app about its datasets as a whole: listing
// them, importing, exporting and deleting. The Dataset
// API's twin for the registry's verbs, and where their route strings live.

import { readNdjson } from '@/client/ndjson';
import type { DatasetInfo, ExportSaved, ImportEvent } from '@/common/types';

import { ApiError, asker, NOT_RESPONDING } from './';
import type { FetchOptions } from './';

// What an import asks of the page while it runs.
export interface ImportHooks {
  // Each step, as the import takes it.
  progress: (message: string) => void;
}

// Each call rejects with ApiError when it fails.
export interface LifecycleApi {
  list: () => Promise<DatasetInfo[]>;
  // Imports a GEDCOM or GEDZIP as a new dataset named `name`.
  importFile: (
    upload: { file: File; name: string },
    hooks: ImportHooks
  ) => Promise<DatasetInfo>;
  // Saves the dataset's GEDZIP into Downloads.
  exportAs: (slug: string) => Promise<ExportSaved>;
  remove: (slug: string) => Promise<void>;
}

export function openLifecycleApi({
  fetch: send = async (req) => await fetch(req),
  origin = ''
}: FetchOptions = {}): LifecycleApi {
  const ask = asker(send);
  const datasets = `${origin}/datasets`;

  // The import's outcome, from its events.
  async function outcome(body: ReadableStream<Uint8Array>, on: ImportHooks) {
    try {
      for await (const raw of readNdjson(body)) {
        const event = raw as ImportEvent;
        if (event.type === 'log') on.progress(event.message);
        else if (event.type === 'error') throw new ApiError(event.message);
        else return event.info;
      }
    } catch (err) {
      // A line that isn't JSON is a bug; a stream cut off isn't.
      if (err instanceof ApiError || err instanceof SyntaxError) throw err;
      throw new ApiError(NOT_RESPONDING, { cause: err });
    }
    throw new ApiError('The import ended without saying how.');
  }

  return {
    async list() {
      const res = await ask('Datasets', datasets);
      return (await res.json()) as DatasetInfo[];
    },

    async importFile({ file, name }, hooks) {
      const body = new FormData();
      body.append('file', file);
      body.append('name', name);
      const res = await ask('Importing', `${origin}/import`, {
        method: 'POST',
        body
      });
      if (res.body === null) throw new ApiError('Importing failed (no answer)');
      return await outcome(res.body, hooks);
    },

    async exportAs(slug) {
      const res = await ask('Exporting', `${datasets}/${slug}/export`, {
        method: 'POST'
      });
      return (await res.json()) as ExportSaved;
    },

    async remove(slug) {
      await ask('Deleting', `${datasets}/${slug}`, { method: 'DELETE' });
    }
  };
}
