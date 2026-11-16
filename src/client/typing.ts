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

// A keydown listener for a field: what's typed in it stays the field's, and
// doesn't reach the page's shortcuts.
export function keepTyping(e: KeyboardEvent) {
  if (typing(e)) e.stopPropagation();
}
