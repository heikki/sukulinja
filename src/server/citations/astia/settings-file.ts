// The install's settings in the data folder, `settings.local.json`: one
// JSON object, each key had by whoever owns it. Changes go one at a time,
// each reading the file afresh, so two changes to different keys never
// lose each other's.

type Settings = Record<string, unknown>;

export function openSettingsFile(path: string) {
  let writing: Promise<unknown> = Promise.resolve();

  // None when the file is missing or unreadable.
  async function read(): Promise<Settings> {
    const file = Bun.file(path);
    if (!(await file.exists())) return {};
    const json = (await file.json().catch(() => null)) as unknown;
    return typeof json === 'object' && json !== null && !Array.isArray(json)
      ? (json as Settings)
      : {};
  }

  return {
    read,

    // Writes what `change` makes of the settings as they are now.
    async update(change: (settings: Settings) => Settings) {
      const run = writing.then(async () => {
        const next = change(await read());
        await Bun.write(path, `${JSON.stringify(next, null, 2)}\n`);
      });
      writing = run.catch(() => undefined);
      await run;
    }
  };
}

export type SettingsFile = ReturnType<typeof openSettingsFile>;
