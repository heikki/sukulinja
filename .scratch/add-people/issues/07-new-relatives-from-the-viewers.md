Status: ready-for-agent
Blocked by: 01

# New relatives from the Scan viewer's and Photo viewer's picker

Spec: `.scratch/add-people/spec.md`.

The person picker (`components/person-search/pick.ts`) lists the Selected person's family as now, and under them _New father…_, _New mother…_, _New spouse…_, _New child…_, _New sibling…_ of the Selected person. The new person is made as in ticket 01 and in the same go cited from the Entry (Scan viewer) or tagged in the Box (Photo viewer). "Someone else…" stays a search of people who exist. No one is made unlinked.

Tests: the new person is in the right family and has the Citation or Tag; one Change for the person and one for the Citation or Tag.
