// Bounded undo/redo stack of text snapshots. Consecutive pushes of the same value are ignored.
export class UndoStack {
  private past: string[] = [];
  private future: string[] = [];
  constructor(private current = '', private max = 100) {}
  get value() { return this.current; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  push(v: string) {
    if (v === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.max) this.past.shift();
    this.current = v; this.future = [];
  }
  /** Replace the current value without creating an undo step (e.g. while typing within the debounce window). */
  replace(v: string) { this.current = v; }
  undo(): string | null { if (!this.past.length) return null; this.future.push(this.current); this.current = this.past.pop()!; return this.current; }
  redo(): string | null { if (!this.future.length) return null; this.past.push(this.current); this.current = this.future.pop()!; return this.current; }
  reset(v = '') { this.past = []; this.future = []; this.current = v; }
}
