Status: needs-triage

# Handle photos the way Citations are handled

Glossary: **Citation**, **Scan viewer**, **Image**, **Box**, **Mark**, **Change**.

Heikki, 2026-11-11: "Valokuvien käsittely samalla tavalla tai samalla tyylillä kuin sitaattien." (Handle photos in the same way, or the same style, as citations.)

## Today

- **Citations** are the app's own: listed in the person panel's _Sources_, opened in the **Scan viewer**, where an entry's **Box** is drawn, a Citation is made for someone, and every act is a **Change**. The app adds its part as an **Annotation** that a re-import keeps.
- **Photos** only come with an import: GEDCOM `OBJE`s into `media` and `media_links` (on a person, family, fact or citation, with a `CROP`), copied into the dataset's media folder and written back by the export. The app uses one of them, the person's primary photo, as the portrait in the chart and the panel header, cropped to the marked face. It shows no other photo, can't add one, and edits nothing about them.

## The idea, as read

Photos get what Citations have: a list on the person, a viewer to look at them in, and editing done in the app, kept across a re-import and listed under _Changes_. A group photo is the closest thing to a church-book Image: one picture, many people, each a Box on it.

## Decisions so far

- **A Photo viewer beside the Scan viewer** (Heikki, 2026-11-11): "Scanweaverin lisäksi meillä olisi Photoweaver ja ne toimisivat melko lailla samalla tavalla." Its own viewer, working much like the Scan viewer, not one viewer for both. What the two share (zooming and panning an image, Boxes on it, the people beside it, the menu on a Box) is to be one set of parts both use, not a copy of the Scan viewer's, where sharing makes sense (Heikki: "Mikä nyt onkin järkevää").
- **First: tagging people in a photo** (Heikki, 2026-11-11). Draw a Box around a face and pick the person, as a Citation is made for someone from an Image. A person's tag is also the crop their portrait can use. Adding photos from disk comes later.
- **Re-import keeps the app's tags** (Heikki, 2026-11-11), as a Citation's Annotation is kept: the export's own part of a photo (its file, its links and crops) comes from the new export, the tags made in the app stay. Only what a tag needs is saved: the photo, the person and the Box ("ei tallenneta mitään turhaa tauhkaa").
- **Opened from a _Photos_ section in the person panel** (Heikki, 2026-11-11), beside _Sources_: the person's own photos and those they're tagged in. A family's or an event's photos are left out for now.
- **Later: browsing every photo**, as the **Church books** view in the top-right corner browses the Volumes, since a photo may be linked to no one and have no one tagged yet.

## Open questions

- **What comes after tagging:** choosing the portrait, a title or date, adding a photo from disk, removing one.
- **Who's in it:** does tagging a person in a photo link the photo to them (a `media_link` per person, each with its own crop), as a Citation is made for each person in a record?
- **Glossary:** "photo" isn't a term yet, and "Image" is taken by Astia's scans. A Photos context of its own, or a term in Citations'.
- **Export:** GEDCOM 7 `OBJE` with `CROP` per link already carries faces and tags; anything else the app adds (a title, who's in it) needs a home there.
