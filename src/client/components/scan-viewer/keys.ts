// The Scan viewer's keys, and what they ask of the dock.

// ←/→ step through the Volume's Images, ↑/↓ through the person's sources.
const STEPS: Record<string, { image?: 1 | -1; source?: 1 | -1 }> = {
  ArrowLeft: { image: -1 },
  ArrowRight: { image: 1 },
  ArrowUp: { source: -1 },
  ArrowDown: { source: 1 }
};

// The source before or after the one shown, asked of the dock, which knows
// their order.
export interface ScanStep {
  citationId: number;
  step: 1 | -1;
}

export type ScanStepEvent = CustomEvent<ScanStep>;

// Closing says which source the viewer showed, for focus to go back to.
export interface ScanClose {
  citationId: number;
}

export type ScanCloseEvent = CustomEvent<ScanClose>;

// What a key press steps, if it steps anything: none while typing, in the
// Image number or anywhere else.
export function stepOf(e: KeyboardEvent) {
  const on = e.composedPath()[0];
  const typing =
    on instanceof HTMLInputElement ||
    on instanceof HTMLTextAreaElement ||
    (on instanceof HTMLElement && on.isContentEditable);
  return typing ? null : (STEPS[e.key] ?? null);
}
