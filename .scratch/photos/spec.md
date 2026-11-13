# Photos, handled like Citations

Heikki, 2026-11-11: handle photos in the same way as citations, with a Photo viewer beside the Scan viewer that works much the same.

## Today

- **Citations** are the app's own: listed in the person panel's _Sources_, opened in the **Scan viewer**, where an entry's **Box** is drawn and a Citation is made for someone. Each act is a **Change**, and what the app adds is an **Annotation** that a re-import keeps (ADR-0013).
- **Photos** only come with an import: GEDCOM `OBJE`s into `media` and `media_links` (on a person, family, fact or citation, with a `CROP`), copied into the dataset's media folder and written back by the GEDZIP export. The app shows one: the person's first photo as the portrait in the chart and the panel header, cropped to its `CROP`. Nothing about photos can be seen or edited beyond that. The 5.5.1 file for MyHeritage leaves photos and crops out.

## Terms

A Photos context of its own in the glossary (GLOSSARY-MAP.md):

- **Photo**: one picture in the dataset. Not an **Image**, which is Astia's scan.
- **Tag**: a person in a Photo, with their **Box**: who and where, as a Citation is to an Image. A Tag always has its Box. Each person in a group photo has a Tag of their own.
- **Box**: the same term as on an Image: only where, a rectangle in pixels of the full-size picture.
- **Photo viewer**: where a Photo is looked at and its people tagged.
- **Photos**: the view browsing every Photo, as **Church books** browses the Volumes.

A photo an import links to a person without a `CROP` is the export's link, not a Tag, and is listed on the person all the same.

## Decisions

- **A Photo viewer beside the Scan viewer**, working much like it, not one viewer for both. What the two do alike is one set of parts both use, where sharing makes sense, not a copy of the Scan viewer's.
- **Opened from a _Photos_ section in the person panel**, beside _Sources_: the person's own photos and those they're tagged in. A family's or an event's photos are left out for now.
- **First: tagging people.** Draw a Box around a face and pick the person, as a Citation is made for someone from an Image. A person's Tag is also the crop their portrait can use.
- **A re-import keeps the app's Tags**, as a Citation's Annotation is kept: the export's own part of a photo (its file, links and crops) comes from the new export. Only what a Tag needs is saved: the Photo, the person and the Box.
- **An import keeps every Photo** (Heikki, 2026-11-11), also one linked to no one, which it drops today: ticket 04.
- **Choosing the portrait** (Heikki, 2026-11-11): _Use as portrait_ on a person's Box in the Photo viewer puts their Tag first among their links. Done.
- **Adding and deleting Photos** (Heikki, 2026-11-12). Done:
  - _Add photos…_ under the **Photos** view picks pictures from disk (JPEG, PNG, GIF, WebP, HEIC), several at once. Each is stored as an import stores one, named by its content in the dataset's media folder, with its file name kept as `original_path` so the GEDZIP packs it under that name. It's a Photo linked to no one, listed among them, and the first added opens in the Photo viewer, where people are tagged in it. The same file added again is the Photo the dataset has. What isn't a picture is refused, by its name.
  - _Delete photo…_ on the Photo in the Photo viewer (off any Box), asked first with how many people are in it. It takes every link to the Photo with it, the import's and Tags alike, and their notes, and removes its file; nothing brings it back (ADR-0021). A person's portrait falls to their next Photo. The viewer shows the next Photo it steps through.
  - Each is a **Change** on nothing, by the file name: _Added a photo_, _Deleted a photo_ (with the people it was on). A Tag's older Changes stay on their person.
- **The export writes a Tag as the person's `OBJE` link with a `CROP`**, the form a Citation's Astia link and Box already take in the GEDZIP, and the form MyHeritage's face crops come in. The 5.5.1 file leaves them out, as today.

## Architecture notes

- **Shared with the Scan viewer.** `src/client/pan-zoom/` is shared already. What's Scan-viewer-only but not about Astia: drawing, moving and clamping a Box on the stage (`scan-viewer/frame.ts`'s `newBox`, `clampBox`, `boxOnStage`, `boxFromStage`), the layer of Boxes with their menus (`scan-viewer/layer.ts`), and the people pane beside the picture (`scan-viewer/people.ts`). These move to a shared component folder first, with the Scan viewer using them as before, before the Photo viewer is built on them. The Astia parts (thumbnails first, Volumes, Re-scans, prefetch) stay in the Scan viewer.
- **Keeping Tags across a re-import.** The merge (`import/merge.ts`) now keeps Annotations of Citations only; a photo's `media_links` come from the new export. A Tag needs to be told apart from an import's link and found again after a re-import, by its Photo's `original_path` and its person. Settled in ADR-0017: a Tag is a person's `media_links` row marked `added_in_app` (schema 11).
- **Changes.** Tagging and untagging someone is a **Change**, on the person and the Photo (`changes.media_id`, schema 3; schema 4 finds it for older ones by the Photo's file name). Picking it selects the person and opens the Photo: among their Photos while they're in it, else among every Photo. A re-import keeps it on the same Photo, found by its path as a Tag is, or on the person when that's gone.

## Later

- After tagging: a title or date. Adding a photo from a person's panel, linked to them.
