Status: ready-for-agent
Blocked by: 01

# Link someone already in the tree, and the duplicate check

Spec: `.scratch/add-people/spec.md`.

- The name form of ticket 01 first offers people with a name alike ("Is it one of these?", the person search's matching). Picking one links them in that place instead of making a new person.
- The same menu items can also go straight to the person search, to link someone known to be in the tree.
- Linking writes a `person` Change (`did: 'link'`). A person already in that place (a child already in the family) isn't added twice.

Tests: a near-same name is offered; linking puts the existing person in the family and makes no new person.
