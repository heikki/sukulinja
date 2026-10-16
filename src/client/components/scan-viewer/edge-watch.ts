// Watches where an element's left edge is on screen as its size changes,
// as when the dock beside it opens, closes or is resized, and reports how
// far it moved.
export class EdgeWatch {
  private readonly moved: (dx: number) => void;
  private readonly observer: ResizeObserver;
  private el: Element | null = null;
  private left: number | null = null;

  constructor(moved: (dx: number) => void) {
    this.moved = moved;
    this.observer = new ResizeObserver(() => {
      this.measure();
    });
  }

  // Watches `el` instead, or nothing.
  watch(el: Element | null) {
    if (el === this.el) return;
    this.observer.disconnect();
    this.el = el;
    this.left = el === null ? null : el.getBoundingClientRect().left;
    if (el !== null) this.observer.observe(el);
  }

  private measure() {
    if (this.el === null) return;
    const left = this.el.getBoundingClientRect().left;
    if (this.left !== null && left !== this.left) this.moved(left - this.left);
    this.left = left;
  }
}
