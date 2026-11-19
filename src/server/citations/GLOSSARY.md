# Citations

A person's **Citations**, as the panel lists them, and linking each **Church-book reference** among them to the Astia scan of the page it points to. Astia (the National Archives) holds the books as **Volumes**; today's references come through MyHeritage, which shows FamilySearch's **Films** of the same books. Neither numbers its images like the other.

## Language

**Citation**:
A reference in the tree to where something comes from, from any source: a person's (or family's) one says they are in that source, a church-book one which **Event** its **Entry** records and their **Role** in it. It may **Support** their Facts. None is on a Fact itself: an import makes a Fact's citation its owner's, supporting the Fact (ADR-0022).

**Support**:
A Citation's backing of one of its person's Facts, or their marriages': _this source says so_. One Citation may support several Facts (a rippikirja line gives the birth, the residence and the marriage), and a Fact may rest on several. Checked or unchecked under the picked Fact in _Events_ (_Add source_ / _Edit sources_), which lists only **Marked** sources (and sources with no Link, which aren't church books), never a **Match** or an **Estimate**; an Entry's card offers to add, support or change the Facts its dates and place record, each to tick or not (ADR-0033). Each added or taken back is a **Change**. GEDCOM writes it as the citation repeated under the Fact.
_Avoid_: evidence (the Entry is that), link (a church-book Citation's place in Astia).

**Fact**:
What the tree says about a person or family: an event (birth, baptism, marriage, residence) or an attribute (occupation), with its date and place. A conclusion, which Citations **Support**, shown under it in _Events_. An import brought most; one is added, changed or deleted in the panel's _Events_ (ADR-0021), and deleting one takes its support, its Citations staying with its person or family.
_Avoid_: event (alone; that's what an Entry records), claim.

**Event**:
What an **Entry** records, as GEDCOM's citation `EVEN` names it: a baptism (`CHR`), a marriage (`MARR`), a burial (`BURI`), or a household in a rippikirja or lastenkirja (`RESI`). Chosen on the Entry's card, as a Volume may hold several **Registers**; its **Book** gives the first guess (ADR-0033). MyHeritage's `EVEN Record` isn't one.
_Avoid_: fact (that's the tree's conclusion).

**Role**:
Who a person is in an **Entry**, as GEDCOM's citation `ROLE` names it: the child (`CHIL`), father (`FATH`), mother (`MOTH`), a godparent (`GODP`), a spouse (`HUSB`, `WIFE`), or another (`OTHER`). On an **Index reference**, its suffix tells it: none for the child, "-F" the father, "-M" the mother. MyHeritage's record id under `ROLE` isn't one.

**Annotation**:
What the app adds to a Citation: its Mark or Match, the page a Mark on an Image moved aside, and whether the app made the Citation. The GEDZIP export carries it.
_Avoid_: note (a GEDCOM NOTE is the source's own text), extras, link columns.

**Reminder**:
Something to come back to, on a person, or on an **Image**, maybe about a person too; open until it's marked done. Reminders live only in their list, which writes, edits and completes them and links to what each is on; a new one is started from a card's menu, on its person, or from the Scan viewer's, on its Image and about the Selected person. Only the app keeps it: no export writes it. One on an Image holds for one filming: after a **Re-scan** it's stale, listed but leading nowhere.
_Avoid_: note (a GEDCOM NOTE), annotation (a Citation's app-made additions), to-do.

**Change**:
One thing done in the app that changed the dataset: a **Mark** (or a **Match** confirmed), a Mark's **Discard**, a Citation made in the Scan viewer, or any Citation deleted, an **Entry**'s Box moved or Transcription retyped (one on each of its Citations), a Role changed, a Tag made, moved or taken back, a **Fact** added, changed or deleted, a Citation's **Support** of a Fact added or taken back, a person added, linked, unlinked, moved, renamed or deleted (Tree), a dataset started with its first person, an import (or, from before ADR-0021, an import undone), or a Volume switched to a **Re-scan**'s new filming. Each says what it did and what it was on (a person, a Citation, an Image, a Tag's Photo with its person, or nothing; a person deleted leaves theirs on nothing, naming them), says _via assistant_ when an assistant's **Proposal** applied it (ADR-0028), and is listed under _Changes_, newest first, where picking one goes back there. Only the app keeps them. _Clear…_ forgets them all.
_Avoid_: log, history (alone; the browser's Back is history), edit.

**Church-book reference**:
The parish, **Book**, years and page a Citation points to in the church books, with the villages and farms it names. Read from a Citation; what scan linking works on. A reference read through MyHeritage also carries a **Record number**.
_Avoid_: citation (the broader thing it's read from).

**Index reference**:
A Church-book reference to an entry in MyHeritage's baptism or marriage index, which FamilySearch's volunteers transcribed from the registers. It gives the event's date and the people the entry names (the child and parents, or the couple), but no page and no usable Record number, so it's found by searching the register's dates. The person cited may be any of them: a parent's citation of a child's baptism names the parent. MyHeritage gives each of them an address of their own for a baptism entry, its number with "-", "-F" or "-M"; the import cites them all by the bare number, so they're one reference and share its Mark.
_Avoid_: index (alone; an index is also a book's own list of names).

### Church books and scans

**Book**:
The kind of church book referenced — rippikirja (communion book), lastenkirja (children's book), kastetut (baptisms), vihityt (marriages) or haudatut (burials); the app calls them by their Astia series names (Pää- ja rippikirjat, Lastenkirjat, Syntyneiden ja kastettujen luettelot, Vihittyjen luettelot, Kuolleiden ja haudattujen luettelot) — with the years it covers. A Book may span several **Volumes** or share one.

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

**Entry**:
One record written in a church book: a baptism, a marriage, or a person's line in a household, on one **Image**, where its **Box** is. What a church-book Citation is evidence from: it keeps its own dates and place as the book writes them (a baptism's born and baptised), which the Facts it supports are concluded from (ADR-0033). Several people's Citations may cite one Entry, each in their own **Role**: a baptism names the child, the parents and the godparents. The app holds one for its own Citations of an Image (made in the Scan viewer or converted), with the Box, Event and Transcription once for all who cite it (ADR-0026); a Church-book reference still holds its own Box until the MyHeritage import goes. One the app holds is edited as a whole: its Box, its Transcription and who it names in which Role, all of it or none.
_Avoid_: record (MyHeritage's record of an Entry, with its **Record number**), citation (one person's reference to it).

**Transcription**:
What an **Entry** says, written out: today a Citation's text, as MyHeritage's volunteers transcribed it or as a **Conversion** read it into plain lines.
_Avoid_: text (alone), abstract.

**Box**:
Where an entry is written on its Image, as a rectangle in whole pixels of the full-size Image, as GEDCOM's `CROP` holds it. The Scan viewer and Vision Match scale it by the Image they have open. People citing the same **Entry** share one.

**Link**:
Where a Church-book reference points in Astia, as far down as its **Precision** goes, and who says so: its **Certainty**. A Split reference has one per candidate Volume.
_Avoid_: scan (the Image itself), URL (the citation's own web address).

**Unlinked**:
A Church-book reference with no Link, and why: it can't be read, its parish's archive isn't known, no Volume fits its years, or its Volume isn't digitized or has no Images; or a request to Astia failed, which passes.
_Avoid_: error (most are facts about the books).

**Page number**:
The number written in the book. Rippikirjat usually number spreads (one number per Image), lastenkirjat pages (two per Image). A Volume may start its numbering over partway through (parts of one book), so one number can be on Images far apart: each stretch is a **Page run**.

**Page survey**:
Reading how a Volume numbers its pages with the vision model: Images at most 20 apart over it, then halfway between any two readings that don't agree exactly, until all do (ADR-0032). What it reads is saved as Page pins. _Locate estimates in this Volume_ runs one first.

**Page run**:
A stretch of a Volume whose Page numbers go up with its Images; one starts where its Page pins' numbers go back. Most Volumes are one. A page is counted within each run its pins reach, and the Record pins around the record pick among them; two Page pins of one page clash only near each other, not across runs.

**Retake**:
A second photograph of the same page within one Volume, on the next Image.

**Re-scan**:
Astia replacing a Volume's Images with a new filming of the book, as it did Mikkeli I Ab:9 (455 greyscale Images, then 434 in colour). Every Image's file id changes, and an Image number may hold another page. Astia gives no notice; it answers an old file id with a placeholder. The Scan viewer then says what switching to the new filming leaves out, and switches when the person says so.
_Avoid_: rescan, refilming (as names).

**Doubled volume**:
A Volume whose Images hold the book twice, as if filmed twice; the copies drift apart in Image numbers. Page pins point into the copy the references were indexed from.

**Scan viewer**:
Where the app shows the Image a Church-book reference links, opened from its source. You step through the link's Volume there, or look in another Volume of its Book. An **Unlinked** reference whose parish's books were looked through opens it too, on no Volume, to look through them for the entry, and an Image's **Reminder**, the **Volumes** view or the **Volume picker** opens it on an Image with no source; there or with one, a new Citation of an entry can be made for someone, and the viewer then opens on it as its source. Beside the scan are the people whose references link the Image shown, and the source's **Match** can be confirmed from its Box's menu. A **Box** placed there for the source's entry waits until it's saved as a **Mark**, and the source's own Box can be taken back with a **Discard**.
_Avoid_: record viewer (a record is MyHeritage's), Astia viewer (Astia's own site).

**Scan cache**:
The Images kept on disk for the Scan viewer and Vision Match, up to a size the install sets, from 5 GB up to as much as its disk has room for; the least recently viewed go first.
_Avoid_: image cache, Astia cache (that's Astia's answers about archives and Volumes).

**Parish**:
A parish whose church books the app finds in Astia: its archive ("… seurakunnan arkisto"), shown by the archive's title, and the spellings references give it, each linking into it. Kept per install in the data folder, so every dataset uses them. A spelling gets its archive where an **Unlinked** reference offers to find it in Astia, and is changed the same way; the **Volume picker** adds one with no spelling.
_Avoid_: parish name (it has none of its own).

**Volumes** (the view):
The corner panel's tab of Volumes, in two modes. _This tree_ is the dataset's **Book list**, as a table by archive, each one's Volumes by series and years, with how many of the dataset's Citations link into each and what of it is on disk; a year or words filter it. A Volume is opened from it in the Scan viewer with no source, downloaded into the Scan cache (every Image at once, under the same cap) or stopped, and one added by hand taken off. _Add volumes…_ opens the **Volume picker**. _All books_ is every Volume with something on this computer, whatever dataset it's of: Images in the **Scan cache** or a download this run, by archive, one in none of the install's **Parishes** by its id alone, under the Scan cache's fill against its cap; a download is started or stopped there, and a Volume's Images removed from disk. Named Volumes, not Church books, as other sources than church books will be listed too.
_Avoid_: church books (as the view's name), archive (a parish's fonds in Astia), library.

**Book list**:
The Volumes a dataset works in: every Volume its Citations link into, and those added by hand from the **Volume picker**, with the archive holding each. Only which Volumes are listed is the dataset's; what of a Volume is on disk, its download and its Page pins are the install's, shared by every dataset. One no Citation links into can be taken off; one cited stays. No export writes it.
_Avoid_: shelf, bookmarks.

**Volume picker**:
Where Volumes are found to add to the **Book list** or open: the dataset's parishes, then the install's other **Parishes**, and finding another in Astia; the Volumes that fit the Selected person, each of their **Expected entries** with the Volumes it fits; and a parish's Volumes by series, narrowed by a series or a year.
_Avoid_: book picker (a Book is a kind of book, not a Volume).

**Expected entry**:
An **Entry** a person's Facts say a kind of **Book** should hold of them, in some years, in the parishes their places name: their baptism in the kastetut of their birth year, their childhood (birth to 15) in the lastenkirjat, their life in the rippikirjat, each marriage in the vihityt, their burial in the haudatut. A life with no death runs to the last year a Fact gives, and says so. Each is looked for in the **Parishes** its own Facts' places name (any part of the place, as a spelling), failing those in the person's other places' and sources' parishes; a life and a childhood in both, as people moved. The Volumes it fits are those of its Book, digitized, covering its years: what the **Volume picker** offers first for the Selected person. One no Citation of theirs records is a gap, where a search for it would start.
_Avoid_: suggestion (that's the Volume offered), gap (one not yet found).

**Precision**:
How far down a Link points: the **entry** on its Image (where on the Image, its Box), the **Image**, or only the **Volume**.

**Certainty**:
Who says where a Link points, most trusted first:

- **Marked** — a person, with a Mark: at the entry, the Image, or only the Volume.
- **Match** — the vision model, at the entry: a suggestion, to confirm or correct with a Mark.
- **Estimate** — a count: the Image counted from the Volume's nearest Page pins or, failing any, guessed from the Book's usual numbering; or only the Volume, chosen by the Book's years or a Record range. Counted from Page pins it's usually right; guessed, often a few Images off.

Not every pair occurs: a person may stop at any Precision, the vision model only saves an entry, and a count never reaches one. A Link is named by its Certainty alone, however far down it points: Marked, Match or Estimate.

A Church-book reference whose Volume can't be told apart has several candidate Volumes: it is **Split**.
_Avoid_: method, scan method (they said how a link was found, not how far to trust it); exact (that's Precision's job).

### Pins

**Pin**:
Something known to be in a Volume, and on which Image: a page, a record, or one reference (which may be pinned to the Volume alone). Page pins and Record ranges are facts about Volumes, saved in the data folder and shared by every dataset; none ship with the app, so an estimate starts from the reference alone. Record pins and Reference pins are a dataset's Marks and Matches, kept in its citations (ADR-0013) and read as pins when a Link is resolved. A pin on an Image keeps the Image's file id, so it holds for one filming: after a **Re-scan** it's **stale**, left out as if never saved, with its Box, until the page or record is pinned again. Record ranges and villages aren't about Images, and stay.
_Avoid_: correction, anchor (alone), placement.

**Page pin**:
A Page number known to be on an Image. Images for other pages of the Volume are counted from the nearest Page pins, so one helps every reference in the Volume. Where a source misread a page number, the Page pin gives the number as referenced and notes what's written.
_Avoid_: anchor.

**Pages checked**:
A Volume's Page numbers marked by hand as right, for every dataset, from the Volume's row in _All books_ or the Scan viewer's menu. Then they're locked: neither set by hand, cleared nor surveyed until unmarked. Vision Match on a Volume not checked asks first, as its estimates count from them.

**Record pin**:
A record known to be on an Image, by the source's id for it (today a MyHeritage **Record number**): a Mark or Match on an Image, as resolution reads it from the dataset's citations of the record. It holds for everyone citing the record, and extends its Volume's **Record range** for that dataset.
_Avoid_: seen record.

**Reference pin**:
One Church-book reference known to be in a Volume, and on which Image when known, by its URL: every marked citation's reference, as resolution reads it. It decides that one reference's Volume, and is no rule for its neighbours.
_Avoid_: placement.

**Mark**:
Saying by hand, in the Scan viewer, which Image a Church-book reference's record is on, or only which Volume. It's written into every citation of the record (by its Record number, or by the reference's URL for one without): on an Image, the citation then cites the Image, its original page kept beside. A cited page found in a Volume the reference already links also becomes a Page pin; a reference with neither a Record number nor a Box then needs no Link of its own. A Mark may also say where on the Image the entry is, its **Box**, drawn by hand. Confirming a **Match** is a Mark too, and keeps where the model said the entry is. A Mark at the entry, with its Box, is a **Conversion** of every citation of the record.
_Avoid_: correction (the link it replaces is often not wrong, only less exact).

**Conversion**:
Turning a Church-book reference Marked at the entry, with its Box, into a Citation of its Image, as if made in the app: it cites the Volume's source, its text is the record's transcription as plain lines, and its original page keeps the reference's URL. A Citation made in the app is never a Church-book reference. Every citation of the record converts together. A converted Citation still counts as a **Record pin** (ADR-0016), and can be deleted like any Citation (ADR-0021).
_Avoid_: migration (that's the one-off script).

**Discard**:
Taking a reference's **Box** back by hand in the Scan viewer, a Mark's or a **Match**'s, so its Link goes back to the estimate. The link goes from every citation of the record, which cite their original page again; Page pins and Record ranges stay. A Match discarded is only undone: nothing of it is kept and it writes no Change, so Vision Match may save it again (ADR-0029).
_Avoid_: clear, delete (only the Box's pins go).

**Provenance**:
Who saved a Pin: by hand (every Mark) or by the vision model. What's saved by hand always wins over the vision model's. Vision pins still count other links' estimates and extend Record ranges; the links they steer stay Estimates.

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
The vision model behind three questions about one Image: the Page numbers written on it, the earliest and latest entry dates on it, and whether a named person is written on it. "Unreadable" is an answer it can give. A **Vision Match** asks it.

**Vision Match**:
Searching the scans for a Church-book reference with the **Reader**, and saving the **Match** it confirms: for every estimate on an Image at once, from the Scan viewer's menu (ADR-0029), which then says what it found and what it took. The name of the search, never of the Match it saves.

**Confirmation**:
Finding the person's name on the Image a search landed on, or on the Images around it. Only a confirmed match is saved.

**Match**:
A link the vision model wrote into the citations of a record after a Confirmation, always with where the entry is, and the Link it gives: a suggestion, ranked above an estimate. The citations keep their original page. A match with no entry found isn't saved. Confirming it from its Box's menu in the Scan viewer is a Mark, which makes the Link Marked at the entry.
_Avoid_: Vision Match (that's the search), suggestion (as names).

**Same scan** / **Different photograph**:
Whether a record's MyHeritage Frame is the very scan Astia holds (same framing, shadows, blots) or a separate filming of the same page, matched by its content — page number, or village, house and household where the book has no page numbers.
_Avoid_: "same page" alone — it doesn't say which.

## Flagged ambiguities

- An **Entry** is evidence and a **Fact** a conclusion: an Entry says what the book says, and a Fact what the tree concludes from Entries. **"Record"** is MyHeritage's: its record of an Entry, with a **Record number**.
- An **Event** is what an Entry records, a **Fact** what the tree says happened: a father's Citation of his child's baptism records `CHR`, and supports none of his own Facts' births.
- A **Citation** is not a **Church-book reference**: many Citations aren't to church books, and the reference is only what's read from one.
- An **Annotation** is not a GEDCOM NOTE, though a GEDZIP writes parts of one as NOTEs (the page a Mark moved aside, "Added in Sukulinja"). Nor is it a **Box** ("annotating an Image" elsewhere means drawing one; here a Box is only one part of an Annotation), or a note written in a church book's margins.
- **"Volume"** is Astia's book; MyHeritage's equivalent is a **Film**, which may hold several Volumes. **"Image"** is Astia's numbering, **"Frame"** MyHeritage's, **"Page number"** what's written in the book.
- A **Mark** places a Church-book reference; moving the Box of an **Entry** the app holds isn't one, as none cites a reference.
- **Marked** and **Match** Links both come from a **Record pin** or **Reference pin**; only who saved it differs. A **Page pin** only improves its Volume's **Estimates**.
- **Precision** and **Certainty** answer different questions: how far down, and who says so. A Box exists exactly when a Link points at the entry.
- Shipped data and the data folder's pins.local.json hold only facts about Volumes (Page pins, Record ranges, villages); Marks and Matches are in each dataset's citations.
- A **Volume** id and an **Image** number are Astia's: a Pin holds only for Astia's scans, and only for the filming it was made on. The page or record it pins holds in any filming of the book.
