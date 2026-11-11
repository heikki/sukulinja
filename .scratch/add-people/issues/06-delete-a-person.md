Status: ready-for-agent
Blocked by: 05, fact-editing 06

# Delete a person

Spec: `.scratch/add-people/spec.md`.

_Delete person…_ in the card menu, after a confirm naming what goes with them (their Facts, Citations, Tags). Works for imported people too (ADR-0021).

- Their names, Facts, Citations, Tags, media links, notes and places in families go, through the facts spec's helper for what a record holds. Families left empty go (as in 05).
- Their Changes and Reminders stay, on nothing. A `person-delete` Change, naming them as they were.
- Deleting the Root makes the nearest relative the Root (a parent, else a spouse, else a child). The last person in a dataset can't be deleted.

Tests: nothing the person held is left in any table; Changes and Reminders stay; the Root moves.
