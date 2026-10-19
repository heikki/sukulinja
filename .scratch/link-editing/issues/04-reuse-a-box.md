Status: ready-for-agent

# Use a Box already on the Image as this source's entry

Spec: `../spec.md` (This is the entry for <source>).

E.g. a parent's citation of a child's baptism, where the entry is already boxed for the child.

## Do

- Right-clicking an entry Box in `sl-scan-entries` adds "This is the entry for <source>" to the context menu. It isn't shown on the current source's own Box.
- It copies that Box into the pending change, with the Image shown. The copy can then be adjusted as in 03.

## Tests

- viewer state: reusing a Box sets the pending Image and Box; adjusting the copy leaves the other entry's Box as it was.
