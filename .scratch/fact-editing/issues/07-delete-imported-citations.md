Status: ready-for-agent

# Allow deleting imported and converted Citations

Spec: `.scratch/fact-editing/spec.md`. ADR-0021 lifts ADR-0016's deferral: nothing brings a deleted Citation back now that imports don't go into an existing dataset.

- `uncite` (`citations/app-citations.ts`) and `deletable` (`citations/citations.ts`) allow any Citation, not only one made in the Scan viewer without an original page.
- A Church-book reference still unconverted can be deleted too; its Record pin goes with it, so check the Estimates of its Film's neighbours in a test.
- The Change says what it cited, as `uncite` does now.
