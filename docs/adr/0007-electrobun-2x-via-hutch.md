# Move to Electrobun 2.x, built by Hutch

The desktop app builds on Electrobun 2.x, whose build toolchain is Hutch and whose default main-process runtime is Cottontail. The `electrobun` dependency had been pinned to an exact `1.16.0`; that pin is gone, and so is the bug it existed for.

## The pin was about decorators, and Cottontail fixes them

Lit's `@customElement` / `@property` / `@state` are legacy TypeScript decorators, which is why `tsconfig.json` carries `experimentalDecorators: true` alongside `useDefineForClassFields: false`. Electrobun 1.18+ ships a Bun whose programmatic `Bun.build()` stopped honouring that flag and emits TC39 standard decorators instead ([oven-sh/bun#30477](https://github.com/oven-sh/bun/issues/30477)), which breaks those decorators at runtime; migrating off them would mean `accessor` on every field. 1.16.0 was the last version whose bundler still honoured the flag. The fix upstream never landed — the PR was closed unmerged once the Rust migration deleted its Zig implementation — so the pin had no unblock condition left.

Electrobun 2.x bundles through Cottontail rather than `Bun.build()`, and Cottontail honours `experimentalDecorators`: the built view bundle carries `__legacyDecorateClassTS`, not `__decorateElement`. Lit's decorators work unchanged and the TC39 migration is not needed.

## The main process stays Bun

`build.mainProcess` is `'bun'`, not the 2.x default of `'cottontail'`. The server process is not portable JavaScript: it serves the client from `Bun.serve` with the idle timeout raised to its maximum so a quiet stretch mid-import doesn't drop the progress stream, and it reads datasets through `bun:sqlite`. Electrobun packages its own pinned Bun for this, so the runtime is fixed by the electrobun version rather than by whatever `bun` is on `PATH`. Moving to Cottontail would mean re-validating the server and SQLite APIs against a different runtime for no gain this app can see; it can be a separate change if it is ever worth making.

## The SDK is no longer in node_modules

Hutch projects the SDK into a generated `.hutch/devkit/` sysroot, and the npm `electrobun` package is a bootstrap for the toolchain. Consequences worth knowing:

- `.hutch/` is generated and gitignored. `bun run sync` creates it, and **typecheck needs it** — without it `electrobun/*` imports don't resolve and `tsc` fails.
- `tsconfig.json` maps `electrobun` and `electrobun/main` into the devkit through `paths` rather than extending `.hutch/devkit/tsconfig.json`, because that file sets its own `baseUrl` and a child's `paths` block replaces rather than merges — extending it would silently re-root every `@common/*` and `@client/*` alias inside `.hutch/devkit/`.
- The 1.16.0 SDK shipped raw `.ts` that imported the untyped `three` and indexed Bun's FFI pointers in ways newer `@types/bun` rejects, so `tsc` reported errors from inside `node_modules`. Those are gone with the SDK move; nothing in this repo imports three.
- `hutch.config.ts` declares `packageManager: 'bun'`. Hutch's built-in resolver would otherwise own dependencies and write its own `hutch.lock`, ignoring `bun.lock` entirely.

## Bundler plugins are gone, and were not needed

Electrobun 2.x serializes the config while loading it, so function-valued bundler plugins cannot cross that boundary. The inline `tsconfig-paths` plugin that resolved `@common/*` and friends at bundle time is deleted: Cottontail's bundler reads `paths` from `tsconfig.json` directly, which is what the plugin was hand-rolling. One mirror of the alias list instead of two.

The plugin also anchored itself to `resolve('.')`, which would have broken regardless — Hutch evaluates the config from a temp directory, not the project root, so a cwd-relative base resolves to nothing.

## Considered options

- **Stay on 1.16.0.** Rejected: the pin's unblock condition can no longer occur, so staying means holding the toolchain still forever — on an old Bun, and accumulating drift against every other dependency.
- **Take 2.x but move the main process to Cottontail** (the 2.x default). Rejected for now: it buys a smaller runtime this app does not need, in exchange for re-validating `Bun.serve` and `bun:sqlite` against a different runtime. Orthogonal to the upgrade, and reversible later.
- **Migrate off legacy decorators to TC39 standard decorators.** This was the other way out of the `Bun.build()` bug, and is what a future Lit will want anyway. Rejected as unnecessary: Cottontail honours the legacy flag, so the upgrade removes the pressure entirely rather than trading it for an `accessor` sweep.
- **Extend `.hutch/devkit/tsconfig.json`**, as the upstream migration guide suggests. Rejected: it re-roots the path aliases into the generated sysroot, and the breakage is silent.

## Consequences

- A fresh clone must run `bun run sync` before `bun run typecheck` or either build script. `bun dev` — the plain server path, which never imports `electrobun/*` — is unaffected.
- The alias list lives in exactly one place, `tsconfig.json`. Adding an alias is a one-line edit that both the typechecker and the bundler pick up.
- `electrobun.config.ts` must stay serializable: no functions, and nothing read off the ambient environment or the working directory. Values that have to be computed belong in the build script.
- The build warns that `icon.iconset` is missing. The app ships without an icon, as it did under 1.x; setting `mac.icons` is the fix when one exists.
