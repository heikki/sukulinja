// Whether a key is pressed while typing in a field, where it's the field's
// alone, not a shortcut for what's under it.
export function typing(e: KeyboardEvent) {
  const on = e.composedPath()[0];
  return (
    on instanceof HTMLInputElement ||
    on instanceof HTMLTextAreaElement ||
    on instanceof HTMLSelectElement
  );
}
