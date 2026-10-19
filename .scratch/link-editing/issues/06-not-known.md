Status: needs-triage

# Say a reference's Volume isn't known

Spec: `../spec.md` (Not known).

Some references can't be placed: the Volume their years or Record range give doesn't hold them, and neither does any other you've looked through. Linking a guessed Volume then says more than is known. A **Not known** row at the foot of the Change Volume list, saved with Save like any change, makes the reference Unlinked by hand.

```
Fits the reference
  I Aa:5  (1790-1796)
Other Volumes
  I Aa:4  (1783-1790)
──────────────────
  Not known
```

## Proposed (confirm before agent work)

- **Storage**: a hand Reference pin without a Volume, `{ unknown: true, by: 'hand' }`, kept by the reference's URL like the rest. `ReferencePin` becomes a union, and every reader of `references` (`locate.ts`, `pins.ts`, `matchedBox`) handles it. A vision save never replaces it, since hand beats vision.
- **Resolution**: a new Unlinked reason, `not-known` ("Not known": "A person looked and couldn't tell which Volume holds this.").
- **Still openable**: an Unlinked reference can't open the Scan viewer today, so a Not known one could never be changed back. Its resolution should also carry the Links by its Book (as `byBook(pins)` resolves them), so clicking the source opens the viewer there, with Change Volume… in its menu to put it in a Volume again. This is the main open question: a `LinkResolution` that is both Unlinked and has Links to open, or another way in.
- **Bar**: Now reads "Not known".
