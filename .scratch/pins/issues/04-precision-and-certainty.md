Status: ready-for-agent

# Say how far down a Link points (Precision) apart from who says so (Certainty)

Glossary: `src/server/citation-scans/CONTEXT.md`: **Precision**, **Certainty**, **Box**, **Reference pin**, **Mark**, **Vision match**.

## The type

```ts
// common/types.ts
type Precision = 'entry' | 'image' | 'volume';
type Certainty = 'marked' | 'vision' | 'estimated';

type Link = {
  volumeId: string;
  volume: string;
  url: string;
  archive?: string;
} & (
  | {
      precision: 'entry';
      image: number;
      box: Box;
      certainty: 'marked' | 'vision';
    }
  | {
      precision: 'image';
      image: number;
      certainty: 'marked' | 'estimated';
      from?: EstimateBasis;
    }
  | { precision: 'volume'; certainty: 'marked' | 'estimated' }
);
```

- A Box exists exactly when `precision` is `'entry'`.
- `from` is set only on `estimated` image Links.
- A Volume Link has no `image`; its `url` opens the Volume's first Image, as today.
- Ranked best first: marked·entry, marked·image, marked·volume, vision·entry, estimated·image, estimated·volume.

## Steps

1. **Pins** (`locate.ts`):
   - `ReferencePin.image` becomes optional; a Reference pin without one pins its reference to the Volume.
   - Record pins always have an Image.
   - A pin's precision is `entry` when it has a box, `image` when it has an Image, and `volume` otherwise.
   - `by` gives the certainty: hand is `marked`, vision is `vision`.
   - A vision pin without a box is ignored when resolving. None exist in the data; see step 3.
2. **Resolution** (`locate.ts`):
   - `toLink` and `referenceLink` build the union.
   - An estimate past the Volume's end, or a reference with no page, is `precision: 'volume', certainty: 'estimated'`.
   - A Volume-level Reference pin gives `precision: 'volume', certainty: 'marked'` in its Volume, overriding the choice by years or Record range for that reference only. It doesn't extend Record ranges.
3. **Matcher** (`matcher.ts`, `scripts/match-citation-scans/run.ts`):
   - A confirmed match without a box isn't saved. It becomes `Unconfirmed` with reason `'no box'` and goes on the review list.
   - `saveVisionMatch` / `recordVision` take `box: Box`, not `Box | null`.
4. **Marks** (`scans.ts`): `markRef` keeps saving as today. A Mark with a Box (confirming a Vision match on its Image) is `marked·entry`; without one it's `marked·image`. Saving a Volume-only Mark is issue 06.
5. **Client**:
   - `imageOf`, `pickedLink`, the Scan viewer's away check and `follow` read `precision` / `'image' in link` instead of `certainty === 'volume'` and the made-up Image.
   - Chips, hints and grouping are keyed by the pair:

     | Pair             | Chip             | Hint                                                                 |
     | ---------------- | ---------------- | -------------------------------------------------------------------- |
     | marked·entry     | Marked           | A person marked this record on this Image.                           |
     | marked·image     | Marked Image     | A person marked this record on this Image; where on it isn't marked. |
     | marked·volume    | Marked Volume    | A person said the record is in this Volume; its Image isn't marked.  |
     | vision·entry     | Vision match     | as today                                                             |
     | estimated·image  | Estimated Image  | as today, by `from`                                                  |
     | estimated·volume | Estimated Volume | as today                                                             |

   - Each chip is the certainty's word, then the precision's unless it's the entry. The Scan viewer's people beside the scan group as Marked, Vision match and Estimated, by certainty; only Links with an Image are listed there.
   - Confirm shows for `certainty === 'vision'`.
6. **Scripts:**
   - `run.ts` skips references whose first Link is `marked` at any precision, or `vision`.
   - `map-citation-scans`' checklist skips estimates with `from === 'pins'`, as now.

## Acceptance

- The type rejects a Box on an image or volume Link, and an `image` on a volume Link. Test it with `// @ts-expect-error` cases in `citations.test.ts` (scan-viewer).
- Tests cover each of the six pairs from resolution: a hand Record pin with a box, one without, a hand Reference pin without an Image, a vision pin, an estimate counted from Page pins, and a Volume-only reference.
- A test checks that a vision match with no box is refused and listed for review.
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **On the `ylonen` data:** the 1,756 vision Record pins all resolve as vision·entry. Person 166's sources show Vision match, Estimated Image and Estimated Volume where they showed Vision match, Estimated and Volume only.
