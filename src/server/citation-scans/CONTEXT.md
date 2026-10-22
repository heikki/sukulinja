# Citation scans

Linking a **Church-book reference** to the Astia scan of the page it points to. Astia (the National Archives) holds the books as **Volumes**; today's references come through MyHeritage, which shows FamilySearch's **Films** of the same books. Neither numbers its images like the other.

## Language

**Citation**:
A reference in the tree to where a fact comes from, from any source.

**Annotation**:
What the app adds to a Citation: its Mark or Vision match, the page a Mark on an Image moved aside, and whether the app made the Citation. A re-import keeps it, while the source program's part comes from the new export.
_Avoid_: note (a GEDCOM NOTE is the source's own text), extras, link columns.

**Church-book reference**:
The parish, **Book**, years and page a Citation points to in the church books, with the villages and farms it names. Read from a Citation; what scan linking works on. A reference read through MyHeritage also carries a **Record number**.
_Avoid_: citation (the broader thing it's read from).

**Index reference**:
A Church-book reference to an entry in MyHeritage's baptism or marriage index, which FamilySearch's volunteers transcribed from the registers. It gives the event's date and the people the entry names (the child and parents, or the couple), but no page and no usable Record number, so it's found by searching the register's dates. The person cited may be any of them: a parent's citation of a child's baptism names the parent.
_Avoid_: index (alone; an index is also a book's own list of names).

### Church books and scans

**Book**:
The kind of church book referenced — rippikirja (communion book), lastenkirja (children's book), kastetut (baptisms) or vihityt (marriages); the app calls them by their Astia series names (Pää- ja rippikirjat, Lastenkirjat, Syntyneiden ja kastettujen luettelot, Vihittyjen luettelot) — with the years it covers. A Book may span several **Volumes** or share one.

**Volume**:
One book in Astia, with its own Astia id and label (e.g. "I Aa:5 Pää- ja rippikirjat (1790-1796)"). The unit a link points into.
_Avoid_: film (that's the MyHeritage side), archive (the parish's fonds that holds the Volumes).

**Part**:
One of several Volumes a Book is split into, usually by village (I, II …). Told apart by the villages in their labels or found in them, or by where each one's page numbering runs.

**Register**:
One run of entries of a kind in a Volume, in date order: baptisms, or marriages (headed _Copulati_ or _Vihityt_). A Volume labelled for one may hold another before or after it, such as its marriages ahead of its baptisms.
_Avoid_: book (the kind a reference cites, which a Volume may hold more than one register of).

**Image**:
One scan in a Volume, numbered from 1 in Astia's order. What a **Link** opens.
_Avoid_: page (written on the scan), frame (MyHeritage's numbering).

**Box**:
Where an entry is written on its Image, as a rectangle in whole pixels of the full-size Image, as GEDCOM's `CROP` holds it. The Scan viewer and the vision pass scale it by the Image they have open. People citing the same record share one.

**Link**:
Where a Church-book reference points in Astia, as far down as its **Precision** goes, and who says so: its **Certainty**. A Split reference has one per candidate Volume.
_Avoid_: scan (the Image itself), URL (the citation's own web address).

**Unlinked**:
A Church-book reference with no Link, and why: it can't be read, its parish's archive isn't known, no Volume fits its years, or its Volume isn't digitized or has no Images; or a request to Astia failed, which passes.
_Avoid_: error (most are facts about the books).

**Page number**:
The number written in the book. Rippikirjat usually number spreads (one number per Image), lastenkirjat pages (two per Image). A Volume may start its numbering over partway through.

**Retake**:
A second photograph of the same page within one Volume, on the next Image.

**Re-scan**:
Astia replacing a Volume's Images with a new filming of the book, as it did Mikkeli I Ab:9 (455 greyscale Images, then 434 in colour). Every Image's file id changes, and an Image number may hold another page. Astia gives no notice; it answers an old file id with a placeholder. The Scan viewer then says what switching to the new filming leaves out, and switches when the person says so; the vision pass and the scripts switch on their own.
_Avoid_: rescan, refilming (as names).

**Doubled volume**:
A Volume whose Images hold the book twice, as if filmed twice; the copies drift apart in Image numbers. Page pins point into the copy the references were indexed from.

**Scan viewer**:
Where the app shows the Image a Church-book reference links, opened from its source. You step through the link's Volume there, or look in another Volume of its Book. An **Unlinked** reference whose parish's books were looked through opens it too, on no Volume, to look through them for the entry; beside the scan are the people whose references link the Image shown, and a **Vision match** among them can be confirmed. A **Box** placed there for the source's entry waits until it's saved as a **Mark**, and the source's own Box can be taken back with a **Discard**.
_Avoid_: record viewer (a record is MyHeritage's), Astia viewer (Astia's own site).

**Scan cache**:
The Images kept on disk for the Scan viewer and the vision pass, up to a size the install sets; the least recently viewed go first.
_Avoid_: image cache, Astia cache (that's Astia's answers about archives and Volumes).

**Precision**:
How far down a Link points: the **entry** on its Image (where on the Image, its Box), the **Image**, or only the **Volume**.

**Certainty**:
Who says where a Link points, most trusted first:

- **Marked** — a person, with a Mark: at the entry, the Image, or only the Volume.
- **Vision match** — the vision model, at the entry: a suggestion, to confirm or correct with a Mark.
- **Estimated** — a count: the Image counted from the Volume's nearest Page pins or, failing any, guessed from the Book's usual numbering; or only the Volume, chosen by the Book's years or a Record range. Counted from Page pins it's usually right; guessed, often a few Images off.

Not every pair occurs: a person may stop at any Precision, the vision model only saves an entry, and a count never reaches one. A Link is named by its Certainty, then its Precision unless that's the entry:

| Precision | Marked        | Vision match | Estimated        |
| --------- | ------------- | ------------ | ---------------- |
| entry     | Marked        | Vision match | —                |
| Image     | Marked Image  | —            | Estimated Image  |
| Volume    | Marked Volume | —            | Estimated Volume |

A Church-book reference whose Volume can't be told apart has several candidate Volumes: it is **Split**.
_Avoid_: method, scan method (they said how a link was found, not how far to trust it); exact (that's Precision's job).

### Pins

**Pin**:
Something known to be in a Volume, and on which Image: a page, a record, or one reference (which may be pinned to the Volume alone). Page pins and Record ranges are facts about Volumes: they ship with the app or are saved in the data folder, shared by every dataset. Record pins and Reference pins are a dataset's Marks and Vision matches, kept in its citations (ADR-0013) and read as pins when a Link is resolved. A pin on an Image keeps the Image's file id, so it holds for one filming: after a **Re-scan** it's **stale**, left out as if never saved, with its Box, until the page or record is pinned again. Record ranges and villages aren't about Images, and stay.
_Avoid_: correction, anchor (alone), placement.

**Page pin**:
A Page number known to be on an Image. Images for other pages of the Volume are counted from the nearest Page pins, so one helps every reference in the Volume. Where a source misread a page number, the Page pin gives the number as referenced and notes what's written.
_Avoid_: anchor.

**Record pin**:
A record known to be on an Image, by the source's id for it (today a MyHeritage **Record number**): a Mark or Vision match on an Image, as resolution reads it from the dataset's citations of the record. It holds for everyone citing the record, and extends its Volume's **Record range** for that dataset.
_Avoid_: seen record.

**Reference pin**:
One Church-book reference known to be in a Volume, and on which Image when known, by its URL: every marked citation's reference, as resolution reads it. It decides that one reference's Volume, and is no rule for its neighbours.
_Avoid_: placement.

**Mark**:
Saying by hand, in the Scan viewer, which Image a Church-book reference's record is on, or only which Volume. It's written into every citation of the record (by its Record number, or by the reference's URL for one without): on an Image, the citation then cites the Image, its imported page kept beside. A cited page found in a Volume the reference already links also becomes a Page pin; a reference with neither a Record number nor a Box then needs no Link of its own. A Mark may also say where on the Image the entry is, its **Box**, drawn by hand. Confirming a **Vision match** is a Mark too, and keeps where the model said the entry is.
_Avoid_: correction (the link it replaces is often not wrong, only less exact).

**Discard**:
Taking a reference's **Box** back by hand in the Scan viewer, a Mark's or a **Vision match**'s, so its Link goes back to the estimate. The link goes from every citation of the record, which cite their imported page again; Page pins and Record ranges stay. A Vision match discarded becomes a **Rejection**.
_Avoid_: clear, delete (only the Box's pins go).

**Rejection**:
A **Vision match** discarded by hand: the reference isn't on that Image. Kept in the dataset, by the reference's URL. The vision pass never saves a match there again, and lists one landing there for review by hand.

**Provenance**:
Who saved a Pin: by hand (the shipped Page pins, and every Mark) or by the vision model. What's saved by hand always wins over the vision model's. Vision pins still count other links' estimates and extend Record ranges; the links they steer stay Estimated.

### Through MyHeritage

**Film**:
FamilySearch's microfilm of the books, as MyHeritage shows it. One Film can hold several Volumes, and its order needn't follow Astia's.

**Frame**:
One image on a Film, numbered as MyHeritage numbers it. The Frame-to-Image offset varies even within one Film.

**Record number**:
MyHeritage's id for a record in the collection. Each Film's records form one unbroken block in Frame order, and blocks never overlap — so one record known to be on a Film places every record numbered around it there too.

**Record range**:
A Volume's span of Record numbers. Overrides choosing the Volume by years. A Record pin outside it extends the nearest range to it, unless another Volume's range lies between.

**Reader**:
The vision model behind three questions about one Image: the Page numbers written on it, the earliest and latest entry dates on it, and whether a named person is written on it. "Unreadable" is an answer it can give. Only scripts ask it; the app never calls a model.

**Confirmation**:
Finding the person's name on the Image a search landed on, or on the Images around it. Only a confirmed match is saved.

**Vision match**:
A link the vision model wrote into the citations of a record after a Confirmation, always with where the entry is, and the Link it gives: a suggestion, ranked above an estimate. The citations keep their imported page. A match with no entry found isn't saved. Confirming it beside the Scan viewer is a Mark, which makes the Link Marked at the entry.

**Same scan** / **Different photograph**:
Whether a record's MyHeritage Frame is the very scan Astia holds (same framing, shadows, blots) or a separate filming of the same page, matched by its content — page number, or village, house and household where the book has no page numbers.
_Avoid_: "same page" alone — it doesn't say which.

## Flagged ambiguities

- A **Citation** is not a **Church-book reference**: many Citations aren't to church books, and the reference is only what's read from one.
- An **Annotation** is not a GEDCOM NOTE, though a GEDZIP writes parts of one as NOTEs (the page a Mark moved aside, "Added in Sukulinja"). Nor is it a **Box** ("annotating an Image" elsewhere means drawing one; here a Box is only one part of an Annotation), or a note written in a church book's margins.
- **"Volume"** is Astia's book; MyHeritage's equivalent is a **Film**, which may hold several Volumes. **"Image"** is Astia's numbering, **"Frame"** MyHeritage's, **"Page number"** what's written in the book.
- **Marked** and **Vision match** Links both come from a **Record pin** or **Reference pin**; only who saved it differs. A **Page pin** only improves its Volume's **Estimated** links.
- **Precision** and **Certainty** answer different questions: how far down, and who says so. A Box exists exactly when a Link points at the entry.
- Shipped data and the data folder's pins.local.json hold only facts about Volumes (Page pins, Record ranges, villages); Marks and Vision matches are in each dataset's citations.
- A **Volume** id and an **Image** number are Astia's: a Pin holds only for Astia's scans, and only for the filming it was made on. The page or record it pins holds in any filming of the book.
