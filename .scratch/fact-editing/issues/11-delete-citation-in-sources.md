Status: ready-for-agent

# Delete any Citation from the panel's Sources

Spec: `.scratch/fact-editing/spec.md`. Follows ticket 07, which lets the server delete any Citation (ADR-0021) and the Scan viewer delete a converted one with its Box.

A Citation with no Box in the Scan viewer (an imported source citation, a Church-book reference not yet Marked) can only be deleted from the person panel's _Sources_, which has no delete today.

- **Refactor first:** _Sources_ is rendered inside `person-panel/index.ts` (about 600 lines), with the scrolling to the viewer's source. Move it into its own component, `person-panel/sources.ts`, as _Events_ moved into `events.ts`, with no behaviour change.
- Then each source row gets _Delete_, asked first and naming the source, as a Fact's form does. `DELETE …/citations/:id` (`uncite`) already writes the Change.
- A Church-book reference's Mark stays with the others citing its record (test in `citations.test.ts`).
