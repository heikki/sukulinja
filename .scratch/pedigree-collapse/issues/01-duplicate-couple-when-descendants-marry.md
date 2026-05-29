Status: needs-triage

> *Filed by AI from a user-reported rendering oddity in the bourbon dataset.*

# Couple rendered twice when two descendants of Focus marry each other (pedigree collapse)

## Context

In the `bourbon` dataset, focused on Louis XIII (`/d/bourbon/#/person/1`), the
couple **Philippe II d'Orléans (1674–1723)** + **Françoise Marie de Bourbon
(1677–1749)** renders **twice** in the descendant stack, side by side under two
different parent couples:

- Under **Louis XIV** — because Françoise Marie is Louis XIV's daughter, with
  Philippe II drawn as her spouse.
- Under **Philippe I** — because Philippe II is Philippe I's son, with Françoise
  Marie drawn as his spouse.

Louis XIV and Philippe I are both sons of the Focus (Louis XIII), so the two
spouses are grandchildren of the Focus through different children who then
married each other. This is **pedigree collapse** (a cousin marriage); the data
is factually correct — the duplication is a layout artifact, not a data error.

Repro: `/d/bourbon/#/person/1?pan=17,-491&zoom=1.29`, Focus = Louis XIII.

## Why it happens

The descendant walk has no "family already emitted" guard.
`buildOwnedMarriages` (`src/client/components/tree-view/build/focus-person.ts:58`)
recurses through every child of every family (line 82) and, for each bloodline
child, builds that child's own marriages — drawing the other partner via a
freshly-created `PersonNode` spouse slot (`resolveSpouseSlot`,
`src/client/components/tree-view/build/family.ts`).

When a single family is reachable from two bloodline descendants, it is built
once per path:

- Louis XIV subtree → child Françoise Marie → her marriage to Philippe II.
- Philippe I subtree → child Philippe II → his marriage to Françoise Marie.

Same underlying family, emitted as two `FamilyNode`s anchored on different
spouses. `emit.ts` then collects every `PersonNode` into `boxes` with no dedup,
so all four boxes (2 persons × 2 paths) render at distinct chart positions.

The deeper issue is not node identity but that **one marriage belongs under two
bloodline columns at once**, and a couple can only occupy one X column. A fix
has to *choose* where the couple lives and how the other branch references it.

## Open question (decide before agent work — likely an ADR)

CONTEXT.md and the ADRs don't yet cover what happens when two bloodline
descendants marry. Options, each with layout consequences (the children's drop
must still connect to both lineages):

1. **Single placement + reference marker.** Render the couple under one branch
   (rule TBD: husband's side / earlier-born / bloodline-primary) and, on the
   other branch, show a lightweight "married into <name>, see other branch"
   marker instead of a full couple.
2. **Keep both boxes, mark one as an echo.** De-emphasize the second copy
   (dimmed, duplicate badge) so it reads as the same person, not two people.
3. **Drop only the duplicated spouse.** Render the bloodline child on each side
   but suppress the duplicated *spouse* on whichever side isn't the couple's
   home, leaving a tie stub pointing across.

Whichever path: introduce a per-build visited-set of family/person ids in the
descendant walk so the second encounter is detected and handled deliberately
rather than silently duplicated.

## Acceptance

- [ ] Decide the desired behavior (capture as an ADR if it sets layout policy).
- [ ] Descendant walk detects when a marriage/person is reachable from two
      bloodline paths instead of silently emitting both.
- [ ] bourbon repro renders the Philippe II + Françoise Marie relationship
      without two free-standing identical couples.
- [ ] Children of a collapsed couple still connect correctly to both lineages.
- [ ] CONTEXT.md gains language for the pedigree-collapse / cousin-marriage case.

## Notes

- Data is from the `D-Jeffrey/gedcom-samples` `sample-bourbon/` GEDCOM, not a
  data-entry mistake — verifiable against any public Bourbon genealogy.
- `resolveSpouseSlot` minting a new `PersonNode` per slot is *how* the second
  instance appears, but caching nodes alone wouldn't answer "which column does
  the couple live in".
