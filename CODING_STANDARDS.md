# Coding standards

Read at review (`/code-review`), not while implementing. These are the judgement calls no linter, typecheck or test makes; what `bun run verify` enforces stays there.

## Architecture

- A feature lands where it belongs: in the module that owns the concept, behind that module's interface, with client, `common` operations and server each doing only their own part. A change that only fits by threading a special case through unrelated code is a **bolt-on**: flag it, and name the refactor that would give the feature a natural home.
- A concept is defined once. A second copy of a rule, a type or a mapping (such as the client recomputing what the server already decides) is a finding, even when both copies agree today.

## Cost of list views

- What a list or table asks for per row stays cheap: its cost grows with the rows shown, never with rows × references, images or datasets. Work that has to walk a volume's references or images is fetched for one row on demand (hover, focus, open), or computed once for the whole list.
- The same holds for anything a panel loads on open or on a tab switch: a person waits for it every time.

**Why:** the All books tab once took about 10 s to open, because every row resolved its volume's cited images to show what offloading would free (fixed in d043ef3).
