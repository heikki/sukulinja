# Photos

The pictures of a dataset and the people in them, handled much as Citations are: listed on a person, and looked at in a viewer of their own beside the **Scan viewer**, sharing its parts (`box-stage/`). Spec: `.scratch/photos/spec.md`.

## Language

**Photo**:
One picture in the dataset, as an import brings it: its file in the dataset's media folder, and its links to people, families, events or citations, a person's maybe with a Box. Only pictures are Photos; a PDF an import keeps isn't.
_Avoid_: image (an **Image** is Astia's scan of a church-book page), media (also the files that aren't pictures), avatar (the portrait the chart draws from a Photo).

**Box**:
The same term as on an Image: where, a rectangle in whole pixels of the full-size picture, as GEDCOM's `CROP` holds it. On a Photo, where a person is in it; the import's crops are the first.

**Tag**:
A person in a Photo, with their **Box**: who and where, as a Citation is to an Image. Made in the app (ticket 02); a person an import links to a Photo, with a Box or not, is the export's link, not a Tag, and is listed on the Photo all the same.

**Photo viewer**:
Where a Photo is looked at, opened from the _Photos_ of the person panel: panned and zoomed as the Scan viewer's scan is, the Boxes of the people in it over it, and those people beside it, each leading to their person. It belongs to the Selected person as the Scan viewer does, and only one of the two is open at a time.
_Avoid_: Photoweaver (only as Heikki's nickname for it).
