Status: ready-for-agent

# Choose an Entry's kind on its card

Spec: `../spec.md` (The card: Kind). ADR-0033.

The card's first row is the kind: Baptism, Marriage, Burial, Household line. It gives the Entry's Event and the Roles shown. First guess: the nearest Entry before it in the Volume, else the Book (`entryEvent`), else none. The Entry stores its kind as its Event (schema change; existing Entries keep theirs). A burial book kind is added to `books.ts` (_Kuolleiden ja haudattujen luettelot_, `BURI`) for the first guess. The Role-less kinds name one person.

The checks (ADR-0026) read the Roles from the Entry's kind, not the Volume's Book.

Done when: an Entry of each kind can be made in a Volume whatever its name, the first guess follows the Entry before, tests for the guess and the check, and `bun dev` in dark mode with a screenshot.
