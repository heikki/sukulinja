Status: ready-for-agent
Blocked by: 01

# Edit a person's name and sex

Spec: `.scratch/add-people/spec.md`.

The panel header's name and sex can be edited, with the same form as ticket 01. Only the person's first name is edited; more names are a later feature.

- `full_text` rewritten the GEDCOM way (`Matti /Virtanen/`) with `given` and `surname`.
- A `person` Change (`did: 'edit'`) saying what it was and became; `CHAN` updated.

Tests: the edit round-trips through the GEDZIP; the Change reads the old and new name.
