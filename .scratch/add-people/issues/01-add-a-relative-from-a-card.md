Status: ready-for-agent
Blocked by: none

# Add a parent, spouse, child or sibling from a card's menu

Spec: `.scratch/add-people/spec.md`.

The card menu gets _Add father…_, _Add mother…_, _Add spouse…_, _Add child…_ and _Add sibling…_. Each asks the new person's given names, surname and sex (`M`, `F`, `X`, `U`), and puts them in the family the spec says (`spec.md`, The idea). Afterwards the new person is selected and the chart moves to them, without a reload.

- Server: `src/server/persons/` with creating a person and a family and putting someone in one, in one transaction with its Change (`person-add`) and the `CHAN` of the person and family. xref (`I<n>`/`F<n>` past the largest) and `UID` from one shared place.
- The relation wording (father, mother, spouse, child, sibling) worked out once from the families, growing `components/person-search/choices.ts`, so ticket 07 uses the same.
- A child of someone with several families: the family is picked in the form.
- The client's people map and chart window brought up to date after the change (ADR-0014).

Tests: each relation lands in the right family, a new family made when there's none; xrefs never clash with imported ones; the Change is written; the GEDZIP export writes the new person and families and reads back the same.
