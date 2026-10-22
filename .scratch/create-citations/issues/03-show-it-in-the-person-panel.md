Status: needs-triage

# Show a Citation made in the app in the person panel

Spec: `../spec.md` (decided 2026-10-22). Glossary: **Citation**, **Mark**, **Link**, **Scan viewer**.

## Do

- **Listed among the person's imported sources**, in the church-book order the panel uses, labelled _Added in Sukulinja_.
- **Named by its text**, or, with none, by its Volume and Image.
- **Its Link** shows as a Mark at the entry, and opens the Scan viewer at its Box, like a Mark.

## Tests

- A person with an imported Citation and one made in the app: both listed, the latter labelled and named by its text, or by Volume and Image.
- Opening it puts the Scan viewer on its Image with its Box.

## From the server (720ce9e)

The person's sources mark it `madeInApp`, `churchBook: true`, with `cited` and `reference` null, already in church-book order by its Volume's years. Its scan line comes at once, a Link Marked at the entry, read from its Annotation.

## Not here

- Making or deleting one (02).
