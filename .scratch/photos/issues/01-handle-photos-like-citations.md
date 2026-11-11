Status: needs-triage

# Handle photos the way Citations are handled

Glossary: **Citation**, **Scan viewer**, **Image**, **Box**, **Mark**, **Change**.

Heikki, 2026-11-11: "Valokuvien käsittely samalla tavalla tai samalla tyylillä kuin sitaattien." (Handle photos in the same way, or the same style, as citations.)

## Today

- **Citations** are the app's own: listed in the person panel's _Sources_, opened in the **Scan viewer**, where an entry's **Box** is drawn, a Citation is made for someone, and every act is a **Change**. The app adds its part as an **Annotation** that a re-import keeps.
- **Photos** only come with an import: GEDCOM `OBJE`s into `media` and `media_links` (on a person, family, fact or citation, with a `CROP`), copied into the dataset's media folder and written back by the export. The app uses one of them, the person's primary photo, as the portrait in the chart and the panel header, cropped to the marked face. It shows no other photo, can't add one, and edits nothing about them.

## The idea, as read

Photos get what Citations have: a list on the person, a viewer to look at them in, and editing done in the app, kept across a re-import and listed under _Changes_. A group photo is the closest thing to a church-book Image: one picture, many people, each a Box on it.

## Open questions

- **Same way or same style?** One viewer for both scans and photos, or a photo viewer of its own that looks and works like the Scan viewer.
- **What's edited first:** choosing the portrait, drawing a person's face (the `CROP`), tagging the people in a group photo, a title or date, adding a photo from disk, removing one.
- **Where photos are listed:** a _Photos_ section in the person panel beside _Sources_, and whether a family's or an event's photos show on its people.
- **Who's in it:** does tagging a person in a photo link the photo to them (a `media_link` per person, each with its own crop), as a Citation is made for each person in a record?
- **Re-import:** a photo edited in the app against the next MyHeritage export, which brings its photos and crops back. Kept as an Annotation like a Citation's, or the app's edit wins outright?
- **Glossary:** "photo" isn't a term yet, and "Image" is taken by Astia's scans. A Photos context of its own, or a term in Citations'.
- **Export:** GEDCOM 7 `OBJE` with `CROP` per link already carries faces and tags; anything else the app adds (a title, who's in it) needs a home there.
