Status: ready-for-agent

# Move viewport files into a `viewport/` subdir

## What to build

Reorganize the viewport-related files inside `src/client/components/tree-view/` into a `viewport/` subdir, following the same convention as the existing `build/` and `nodes/` subdirs. No behavior change; pure structural move.

Target layout:

```
tree-view/
  viewport/
    index.ts       — barrel re-exporting the public API used by index.ts
    transform.ts   — renamed from viewport-transform.ts
    transform.test.ts — renamed from viewport-transform.test.ts
    momentum.ts    — renamed from momentum-pan.ts
```

Drop the redundant `viewport-` prefix on filenames inside the subdir — the directory does the namespacing (same as `build/sibship.ts` rather than `build/build-sibship.ts`).

`viewport/index.ts` re-exports the same names currently imported by `tree-view/index.ts`:

- From `transform.ts`: `chartToScreen`, `fitTo`, `pinChartPointAtScreen`, `zoomAt`, plus types `FitOptions`, `ScaleBounds`.
- From `momentum.ts`: `startMomentumPan`, plus types `MomentumHandle`, `MomentumOptions`.

Update `tree-view/index.ts` to import everything from `./viewport` instead of the two flat files.

## Acceptance criteria

- [ ] The three files live under `tree-view/viewport/` with the renamed filenames listed above.
- [ ] `tree-view/viewport/index.ts` exists and re-exports the symbols the element needs.
- [ ] `tree-view/index.ts` imports from `./viewport` only — no remaining references to `./viewport-transform` or `./momentum-pan`.
- [ ] `bun run` format / lint / typecheck all pass.
- [ ] The existing `transform.test.ts` (renamed `viewport-transform.test.ts`) continues to pass with no logic changes.
- [ ] App runs and pan/zoom/momentum behave identically — manual smoke check.

## Blocked by

None — can start immediately.
