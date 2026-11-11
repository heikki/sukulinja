Status: ready-for-agent
Blocked by: 01

# Unlink a person from a family

Spec: `.scratch/add-people/spec.md`.

The card menu gets _Remove as child of …_ and _Remove as spouse of …_, the person themself staying in the tree. A family left with no one in it is deleted, one left with one person stays. A `person-unlink` Change; `CHAN` of the family.

An unlinking that would cut anyone off from the Root isn't in the menu (spec, Decisions: Nothing cuts the tree in two), and the server refuses it too. The connectivity check is worked out as the menu opens.

Tests: an unlinking that would cut someone off isn't offered and is refused by the server, and one at the edge goes through; unlinking leaves the person; an emptied family goes; the chart no longer shows the link.
