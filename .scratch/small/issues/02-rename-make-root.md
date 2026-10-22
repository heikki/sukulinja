Status: needs-triage

# Say what "Make Root" does in the card menu

Glossary: **Root** (`src/client/components/tree-view/CONTEXT.md`).

A chart card's right-click menu offers "Make Root" (`src/client/components/tree-view/card-menu.ts`). **Root** is the glossary's word for the person the chart is built around, but the menu should say what happens rather than use the term: something like "Build tree from here".

Only the label changes. `makeRoot` and **Root** stay as the code's and the glossary's names. Double-clicking a relative in the person panel does the same thing, without a label.

## Open questions

- **Wording.** "Build tree from here", "Build tree around this person", "Center tree here" (although the glossary avoids "center person"), or a shorter one.
- **Glossary.** Whether the Root entry should note the menu's wording, so the label and the term don't drift apart.

## Comments
