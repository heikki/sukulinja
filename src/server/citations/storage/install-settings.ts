// The install's settings, in `settings.local.json` of the data folder:
// Storage's cap and its offload folder.

// The settings; none when the file is missing or unreadable.
export async function readSettings(file: string) {
  const none: Record<string, unknown> = {};
  const settings = Bun.file(file);
  if (!(await settings.exists())) return none;
  const read = (await settings.json().catch(() => null)) as typeof none | null;
  return read ?? none;
}

// Saves one setting, keeping the others.
export async function saveSetting(file: string, key: string, value: unknown) {
  const saved = { ...(await readSettings(file)), [key]: value };
  await Bun.write(file, `${JSON.stringify(saved, null, 2)}\n`);
}
