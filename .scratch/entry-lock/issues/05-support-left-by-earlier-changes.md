Status: done
Blocked by: 02

# Support left by earlier Role and kind changes

ADR-0037. Count, in Heikki's datasets on the Mac, the support rows by a Citation of an Entry that isn't its owner's, or of a Fact that isn't the owner's. Only if there are any: a one-off script under `scripts/` that takes them back, each with its Change, run once and then removed, as `tidy-places` was.

## Comments

2026-11-26: counted on the Mac. ylonen had 50 such rows, all of Entries MyHeritage's EVEN made 'Record' (40 RESI, 6 DEAT, 4 BIRT, 4 CHR): no kind the app makes, so no owner known. The rule now treats those as kindless, which leaves none; the other datasets had none. No script needed.
