Status: ready-for-agent

# Reach MyHeritage's references through one port

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Church-book reference**, **Citation**, **Link**, **Mark**, **Discard** (`src/server/citations/GLOSSARY.md`).

A refactor with no change in behaviour. `citations.ts` branches on `book !== null` in `mark`, `discard`, `volumeChoices`, `linksOf`, `inVolume` and `toCitation`, and reads MyHeritage records itself when a page contains `myheritage.` (`contentOf`, `readRecord`). The Conversion needs one place that says what a reference is.

- **A `References` interface** that `myheritage/index.ts` implements, and `openCitations` passes into `createCitations` in place of `Scans`: the reference a row makes, given its page, text and whole Annotation (so it can later say no for an app-made Citation); resolving a reference's Links and a Volume's; Mark, Discard and Volume choices; the parishes the references give; and how a reference's text is shown (today's `record` view).
- **`citations.ts`** knows two kinds: a Citation of an Image (its stored Link) and whatever the port says. No import from `./myheritage` but the port's type.
- An **empty implementation** of the port, used by a test: with it, the dataset's Citations of Images work alone. It is what replaces the folder in the end.

## Tests

- The existing citations, scans and app-citations tests pass unchanged.
- With the empty port, a dataset with only Scan viewer Citations lists, links and moves them.

## Comments
