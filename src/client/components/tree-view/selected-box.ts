// The Selected box: which of the Selected person's cards the chart rings,
// and where the arrow keys step from. A step moves it at once; its person
// is selected once the keys pause, so a held arrow doesn't load everyone
// it passes.

import type { Box, EmitOutput, Point } from './emit';
import { stepFrom } from './steps';
import type { Step } from './steps';

const PAUSE_MS = 250;

export class SelectedBox {
  private chart: EmitOutput | null = null;
  private key: string | null = null;
  // A step whose person waits to be selected; until then the box is ahead
  // of the Selected person.
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly on: {
      // Selects the person stepped to.
      select: (id: number) => void;
      pauseMs?: number;
    }
  ) {}

  get box() {
    return this.chart?.boxes.find((b) => b.key === this.key);
  }

  isRinged(box: Box) {
    return box.key === this.key;
  }

  copiesOf(id: number) {
    return this.chart?.boxes.filter((b) => b.personId === id) ?? [];
  }

  // The chart as drawn. The box stays while it's drawn as the Selected
  // person or a step waits, as across a Generation Relayout; else it's
  // whichever of the Selected person's copies `inView` picks of their
  // centres, as on a reload, Back or Forward, or a Root Relayout.
  drawn(
    chart: EmitOutput,
    selectedId: number | null,
    inView: (centers: Point[]) => number | null
  ) {
    this.chart = chart;
    const kept = this.box;
    if (
      kept !== undefined &&
      (this.timer !== null || kept.personId === selectedId)
    ) {
      return;
    }
    const copies = selectedId === null ? [] : this.copiesOf(selectedId);
    this.key = copies[inView(copies.map((b) => b.pos)) ?? 0]?.key ?? null;
  }

  // A click on it, or a selection showing it; any step waiting is dropped.
  pick(key: string | null) {
    this.cancel();
    this.key = key;
  }

  // An arrow key's step, to the box it lands on, or null where it goes
  // nowhere.
  step(step: Step) {
    const { box, chart } = this;
    if (box === undefined || chart === null) return null;
    const next = stepFrom(chart.boxes, box.key, step);
    if (next === null) return null;
    this.key = next.key;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, this.on.pauseMs ?? PAUSE_MS);
    return next;
  }

  // The step waiting, its person selected now.
  flush() {
    if (this.timer === null) return;
    this.cancel();
    const box = this.box;
    if (box !== undefined) this.on.select(box.personId);
  }

  cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
