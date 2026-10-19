// Run an async worker over a list with bounded concurrency: at most
// `concurrency` workers pull items off the shared cursor at a time. Used to cap
// in-flight photo downloads and media-file reads so a large import can't open
// thousands of sockets/file handles or buffer everything at once.
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  // The first failure: no item is started after it, and it's thrown only
  // once the items under way have settled, so the caller can clean up
  // without a worker still writing.
  const failures: unknown[] = [];
  async function run(): Promise<void> {
    // Each pool worker pulls items one at a time, so awaiting in the loop is the
    // point — it bounds concurrency to the number of workers.
    while (failures.length === 0 && next < items.length) {
      const i = next;
      next += 1;
      try {
        // eslint-disable-next-line no-await-in-loop -- bounding concurrency to the worker count is the point
        await worker(items[i]!);
      } catch (error) {
        failures.push(error);
      }
    }
  }
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, run));
  if (failures.length > 0) {
    const [first] = failures;
    throw first instanceof Error ? first : new Error(String(first));
  }
}
