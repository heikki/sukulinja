# Collapse the bloodline-pyramid shift when one parent's ancestry is empty

ADR-0001 sizes each ancestor couple's directional Tie shift for a balanced binary
pyramid: `(2^max(1, levels − depth) − 1) × half-slot`. That magnitude assumes the
couple's sibling subtree fans the opposite way and counterweights it. When one
parent has no bloodline ancestry, the counterweight never materialises: the lone
pyramid drifts far off **Focus**'s column — the deeper the filled side, the worse
(a 4-deep paternal line with an empty maternal side lands the grandparents ~3.5
slots left of the father, the whole pyramid hanging off to one side).

Decision: when a couple's sibling subtree is empty, collapse that side's shift to
the minimum half-slot, tucking the lone pyramid back over its bloodline child. The
full ADR-0001 magnitude is unchanged whenever both sides carry ancestry. Each
parent is told whether its spouse at this couple has known ancestry, so the
collapse applies per-couple and recurses — nested lopsidedness tucks too.

Resolves `.scratch/ancestor-pyramid-sparse-shift`.

## Considered options

- **Per-subtree depth** (size the shift from this branch's own filled depth, not
  the chart-wide max). Rejected: a deep-but-lopsided line genuinely _is_ that deep,
  so per-subtree depth equals the global max and the shift is identical — it does
  not move the repro at all. A prototype confirmed byte-for-byte parity with
  today's behaviour on the empty-maternal case.
- **Filled-extent / unified shift** (derive the magnitude from the subtree's
  actual occupied width, so sparse lines tuck and full trees spread). Rejected: the
  width measure overshot and produced overlapping ancestor columns on real charts;
  fixing the overlap needs more tuning than this bug warrants.
- **Empty-sibling collapse** (chosen). Binary: fires only when a sibling subtree is
  entirely empty. A no-op for balanced ancestry, so it cannot regress the common
  case — the lowest-risk fix for the reported symptom.

## Consequences

- The shift now depends on one extra bit per couple — whether the spouse here has
  known ancestry (`hasKnownAncestry`) — threaded as `siblingEmpty` through
  `buildAncestorStack` and `buildAncestorPersonAtParentRow`.
- Balanced ancestry is unchanged: with both sides filled, `siblingEmpty` is always
  false and the ADR-0001 magnitude applies verbatim (verified — a balanced chart
  keeps the full directional shift).
- The collapse is **binary** and the collapsed magnitude is a flat half-slot
  regardless of the filled side's depth: the lone pyramid sits directly over its
  bloodline child. A shallow-_but-nonempty_ sibling still gets the full ADR-0001
  shift; that over-fan is left open as lower-impact than the empty-sibling case.
