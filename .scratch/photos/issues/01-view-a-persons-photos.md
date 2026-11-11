Status: ready-for-agent

# View a person's Photos in the Photo viewer

Spec: `../spec.md`. Glossary: **Photo**, **Photo viewer**, **Box**, **Scan viewer**.

A _Photos_ section in the person panel, beside _Sources_, lists the person's own Photos and those they're tagged in, as thumbnails. Picking one opens the Photo viewer on it: pan and zoom like the Scan viewer, the Boxes of the people tagged in it (the import's `CROP`s on person links), and the people beside the picture, each leading to their person. Esc and closing work as the Scan viewer's.

## First, a refactor

The Box stage, the Box layer and the people pane are written for the Scan viewer today. They move to a shared component, with the Scan viewer using it unchanged, before the Photo viewer is built on it (see the spec's architecture notes). No Astia code goes into the shared part.

## Done when

- The person panel shows _Photos_ when the person has any, and none otherwise.
- The Photo viewer opens on a Photo, shows its Boxes and people, and closes.
- The Scan viewer works as before on the shared parts.
- Checked in `bun dev` in dark mode, with a dataset that has photos.
