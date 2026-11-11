Status: ready-for-agent
Blocked by: 01

# Tag people in a Photo

Spec: `../spec.md`. Glossary: **Tag**, **Box**, **Photo viewer**, **Change**, **Annotation**.

In the Photo viewer, draw a Box around a face and pick the person, as a Citation is made for someone in the Scan viewer. Move or take back a Tag from its Box's menu. Tagging and untagging is a **Change** on the person. The person's portrait can then use their Tag's Box.

## First, a design question

How a Tag is stored so a re-import keeps it, and only what it needs (Photo, person, Box): a column on `media_links` marking the app's own, or a table of its own keyed by the Photo's `original_path`. Write it as an ADR before the code. A schema change either way.

## Done when

- A Tag is made, moved and removed in the Photo viewer, and listed under _Changes_.
- A re-import keeps the app's Tags and takes the rest of the photo from the new export.
- The GEDZIP export writes a Tag as the person's `OBJE` link with a `CROP`; the 5.5.1 file leaves it out.
- Checked in `bun dev` in dark mode.
