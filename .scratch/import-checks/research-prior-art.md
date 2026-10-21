# Research: what checks other genealogy tools run over a tree, and how they report them

Researched 2026-10-21. For `issues/01-check-an-imported-tree.md`.

## Summary

Every tool surveyed separates **checks that report** from **tools that change data**, and the whole-tree check is always an on-demand run that produces a list:

- **Report-only plausibility checks.** Gramps "Verify the Data" (43 rules, 15 thresholds), RootsMagic Problem List, Family Tree Maker's Data Errors Report, MyHeritage's Tree Consistency Checker (36 checks), MacFamilyTree's Plausibility list, and GeneWeb's consistency check (run on every GEDCOM import, written to a log). Each result row names the person, says what is wrong, and opens that person for editing. Nothing is corrected automatically.
- **Tools that change data, marked as such.** Gramps "Check and Repair Database" (warns that it "performs automatic fixes", including silently dropping a child listed twice in a family), Gramps "Merge Citations", webtrees "Data fixes" (preview, then update), RootsMagic "Merge all duplicate citations", MacFamilyTree's maintenance tools.
- **Dismissing a finding** is common and persistent. Gramps keeps marks per person, rule and threshold in a file. RootsMagic has a "Not a problem" list. MyHeritage ignores single issues or switches off whole checks. MacFamilyTree has a "reset all suppressed warnings" button. webtrees only hides findings on the page.
- **Severity** usually has two or three levels: error/warning in Gramps; error/warning/info in webtrees and gedcom4j; errors/warnings/notices in MyHeritage.
- **Duplicate citations**, our first finding, are covered by only a few tools. gedcom4j flags any repeated citation on a record as an ERROR. webtrees' "Remove duplicate links" finds a repeated identical substructure, such as the same `SOUR` with the same `PAGE`. RootsMagic and Gramps merge citations that are exactly the same, or that share source and page; both change data. None of the plausibility checkers lists duplicate citations as a check. MyHeritage's published examples don't mention them either (its full list isn't public).
- **Thresholds differ a lot between tools.** For example, the maximum age at death is 90 in Gramps, 100 in RootsMagic and elliotchance/gedcom, 100 or 105 in GeneWeb (depending on the year of death), and 110 in MyHeritage. The full table is in "Thresholds side by side" below.

Most of Gramps' option names (`oldage`, `cspace`, `cbspan`, `wedder`, `lngwdw`, `oldunm`, …) match those of LifeLines' `verify.ll` (1992), which suggests a common origin. Gramps does not document this. Gramps still defines `lngwdw` (longest widowhood) but no rule uses it. Its "Too many children" rule can never fire because of a bug (details in section 1).

## 1. Gramps

Version read: `master`, whose rules and defaults match release v6.0.8 (2026-04-09). Source files: [verify.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/tool/verify.py), [check.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/tool/check.py), [finddupes.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/tool/finddupes.py) and [mergecitations.py](https://github.com/gramps-project/gramps/blob/master/gramps/plugins/tool/mergecitations.py). Manual: [Gramps 6.0 Wiki Manual – Tools](https://gramps-project.org/wiki/index.php/Gramps_6.0_Wiki_Manual_-_Tools), last edited 2026-01-16. License GPL-2.0-or-later.

### Verify the Data (reports only)

The module docstring calls it "the research tool, not the low-level data integrity check". The manual says "The ultimate decision is yours", since a flagged item can be correct.

**Default thresholds** (`VerifyOptions.options_dict`; the manual lists the same values):

| Option         | Default | Meaning                                          |
| -------------- | ------- | ------------------------------------------------ |
| `oldage`       | 90      | Maximum age (at death; also "old but no death")  |
| `hwdif`        | 30      | Maximum husband–wife age difference (years)      |
| `cspace`       | 8       | Maximum years between children                   |
| `cbspan`       | 25      | Maximum span of all children's births            |
| `yngmar`       | 17      | Minimum age to marry                             |
| `oldmar`       | 50      | Maximum age to marry                             |
| `yngmom`       | 17      | Minimum age to bear a child                      |
| `oldmom`       | 48      | Maximum age to bear a child                      |
| `yngdad`       | 18      | Minimum age to father a child                    |
| `olddad`       | 65      | Maximum age to father a child                    |
| `wedder`       | 3       | Maximum number of spouses                        |
| `mxchildmom`   | 12      | Maximum children for a woman                     |
| `mxchilddad`   | 15      | Maximum children for a man                       |
| `lngwdw`       | 30      | Longest widowhood: defined, but no rule reads it |
| `oldunm`       | 99      | Maximum age for an unmarried person              |
| `estimate_age` | 0 (off) | Estimate missing or inexact dates                |
| `invdate`      | 1 (on)  | Flag invalid birth/death dates                   |

Dates are compared as day numbers, and ages are days ÷ 365.

**Rules** (rule ID and severity as in the source; E = error, W = warning):

- _One person's own events:_ 1 Baptism before birth (E); 2 Death before baptism (E); 3 Burial before birth (E); 4 Burial before death (E); 5 Death before birth (E); 6 Burial before baptism (E); 43 Person events not in chronological order (E); 41 Person has events with role Unknown (E).
- _Age and life:_ 7 Old age at death, over `oldage` (W); 32 Old age but no death, over `oldage` and no death or burial (W); 33 Birth date equals death date (W); 37 Burial too late, more than 14 days after death (W); 36 Baptism too late "according to family tradition": the gap from birth to baptism is more than 120 days over the median gap of the person's siblings (W).
- _Data quality:_ 8 Unknown gender (W); 29 Invalid birth date (E); 30 Invalid death date (E); 28 Disconnected individual: no parent family and no own family (W); 9 Multiple parents: more than one parent family (W).
- _Marriage:_ 10 Married often, more than `wedder` (W); 11 Old and unmarried, over `oldunm` (W); 13 Same sex marriage (W); 14 Female husband (W); 15 Male wife (W); 16 Husband and wife with the same surname (W); 17 Large age difference between spouses, over `hwdif` (W); 18 Marriage before birth (E); 19 Marriage after death (E); 20 Early marriage, under `yngmar` (W); 21 Late marriage, over `oldmar` (W); 31 Marriage date but relationship not "married" (W); 34 Birth date equals marriage date (E); 35 Death date equals marriage date (W, commented "it's possible"); 39 Families not in chronological order (W); 40 Family has events with role Unknown (E); 42 Family events not in chronological order (E).
- _Parents and children:_ 12 Too many children, over `mxchildmom`/`mxchilddad` (W). As written it never fires: `broken()` compares the method `get_gender` with `Person.MALE` instead of calling it; 22 Old father/mother (W); 23 Young father/mother (W); 24 Unborn father/mother: a parent born after the child (E); 25 Dead father/mother (E): the child is born after the mother's death, or more than 294 days after the father's death; it counts only children whose relation to that parent is "Birth"; 26 Large year span for all children, over `cbspan` (W); 27 Large age differences between children, over `cspace` (W); 38 Children not in chronological order (E).

There is **no citation or source rule** in Verify.

**How results are shown.** The "Data Verification Results" window lists each finding with a Mark checkbox, Warning, ID and Name, and an icon for person or family. Error rows are drawn in red (`VerifyResults.add_results`). Findings with the same message group under one parent row. Buttons: Mark all, Unmark all, Invert marks, Hide marked. Double-clicking a row opens the person or family editor (`VerifyResults.double_click`). Marks are saved in a pickle file per database (`<md5 of db path>.vfm`), keyed by object handle and `(rule ID, parameters)`. Changing a threshold therefore brings a marked finding back. The tool also runs from the command line and prints `S: msg, type: gid, name` lines (`Verify.__init__`).

### Check and Repair Database (changes data)

The manual warns "The Check and repair Database tool performs automatic fixes", which cannot be undone with Undo History. It says to make a backup first. Among other things, the code:

- removes links to missing people, families, sources, citations and media;
- adds missing back-links;
- **silently removes a child listed twice in one family**, and duplicate parent-family links on a person (`check_for_broken_family_links`; this branch logs nothing);
- removes a person who is both parent and child of the same family from its children;
- removes a duplicate spouse-family link (`cleanup_duplicate_spouses`);
- swaps the father and mother when the father is female or the mother male (`check_parent_relationships`);
- deletes empty families and objects;
- renumbers duplicated Gramps IDs;
- corrects invalid dates.

The results come as one "Integrity Check Results" text summary of counts, or "No errors were found".

### Find Possible Duplicate People (reports; merges only on request)

Scores pairs of people by name, birth and death dates, and places. Name comparison uses Soundex by default. A pair is skipped when one is the other's ancestor. The match threshold is Low 0.25 (default), Medium 1.0 or High 2.0. The "Potential Merges" list shows Rating, First Person and Second Person. Compare opens Merge People, and nothing merges without confirmation ([manual](https://gramps-project.org/wiki/index.php/Gramps_6.0_Wiki_Manual_-_Tools#Find_Possible_Duplicate_People)).

### Merge Citations (changes data)

For each source, the tool merges citations whose key matches. The key is `page`, plus the date and the confidence unless they are ignored. The default (`fields: 1`) is "Ignore Date", so it matches on Page/Volume and Confidence. An option skips citations that have notes. The result is a single "Number of merges done" dialog. In Gramps a citation is a shared object, so this merges citation records, not repeated references on one person.

## 2. LifeLines `verify.ll` (1992–2007)

Source: [reports/verify.ll](https://github.com/lifelines/lifelines/blob/master/reports/verify.ll), report version 12/13 by Jim Eggert. LifeLines license MIT. It is a report program that writes a text file of "exceptions to assertions". Each line carries a six-character code, such as `dbefb` (dies before birth) or `mulchl` (child in family multiple times). There is also a verbose English form.

Its header suggests a workflow: fix everything once, then keep a "reference report", and `diff` later runs against it to catch new errors. It also suggests sorting the output by the code column.

Defaults: `oldage` 90, `maydec` 20 (husband–wife gap), `yngmar` 18, `oldmar` 50, `fecmom` 8, `oldmom` 45, `yngmom` 18, `fecdad` 10, `olddad` 60, `yngdad` 18, `wedder` 2, `cspace` 8, `cbspan` 25, `oldunm` 40, `lngwdw` 20. It uses years only. It warns that `ABT`/`BEF`/`AFT` qualifiers "will be lost on this program".

The checks Gramps lacks:

- `illeg`: child born before the parents' marriage;
- `ctwins`: child born the same year as a previous child;
- `samgiv`: child with the same given name as a sibling;
- `nonpat`: child doesn't carry the father's surname;
- `mrbbpm` and `mrabsm`: a marriage out of order with children of another marriage;
- `mmnsnk`: an extra marriage with no spouse and no children;
- family integrity checks: `nomems` (family without members), `noprnt` (family without parents), `mulhus`/`mulwif` (more than one husband or wife), `mulchl` (child in a family more than once), and missing pointers in either direction.

## 3. webtrees

Version read: tag 2.2.6 (2026-04-29). License GPL-3.0.

### Check for errors (reports only)

Lives under Control panel → Manage family trees ([CheckTree.php](https://github.com/fisharebest/webtrees/blob/2.2.6/app/Http/RequestHandlers/CheckTree.php), [trees-check.phtml](https://github.com/fisharebest/webtrees/blob/2.2.6/resources/views/admin/trees-check.phtml)). The checks are **structural only**:

- _Errors:_
  - invalid GEDCOM record, level number or tag;
  - a pointer to a record that doesn't exist, or to a record of the wrong type (for example a FAMC pointing at a source);
  - a link without its back-link (FAMS↔HUSB/WIFE, FAMC↔CHIL);
  - an invalid value;
  - a filename not compatible with GEDZIP;
  - `FAM:HUSB` or `FAM:WIFE` that "occurs too many times".
- _Warnings:_ custom tags ("discouraged"); inline-source records ("discouraged"); a missing xref that differs only in case ("Did you mean …?"); a media format webtrees doesn't recognise.
- _Info:_ a value that isn't in canonical form, shown as "“x” should be “y”".

The page lists errors in red, warnings in yellow and info in blue. Each row gives the record type, a link to the record, the line number and the raw GEDCOM line. A "Hide these errors — `<tag>`" button hides every row with the same tag, but only on that page, in JavaScript. If the server's time limit is reached, a "show more" link continues.

### Data fixes (change data, with preview)

The modules are `FixDuplicateLinks`, `FixMissingDeaths`, `FixNameSlashesAndSpaces`, `FixNameTags`, `FixCemeteryTag`, `FixPlaceNames`, `FixPrimaryTag`, `FixSearchAndReplace` and `FixWtObjeSortTag` ([app/Module](https://github.com/fisharebest/webtrees/tree/2.2.6/app/Module)). The page searches for candidate records and shows each with **Preview** (a diff) and **Update** buttons, plus **Update all**. The help text says the candidate list is a "simple (but fast) search", so it "includes records that will not be updated" ([data-fixes.phtml](https://github.com/fisharebest/webtrees/blob/2.2.6/resources/views/help/data-fixes.phtml)).

- **Remove duplicate links** (`FixDuplicateLinks`): "A common error is to have multiple links to the same record, for example listing the same child more than once in a family record." It matches a level-1, 2 or 3 substructure that contains an `@xref@` and appears again **word for word** under the same parent, and removes the first copy. A citation (`1 SOUR @S1@` / `2 PAGE …`) repeated identically on a person matches, so this catches our 6 word-for-word duplicates. It would not catch the other 22 groups, where the text differs.
- **Add missing death records** (`FixMissingDeaths`) adds `1 DEAT Y` to people webtrees infers are dead. It exists to speed up privacy calculations.

### Find duplicates (reports only)

Lives under Control panel → Manage family trees ([AdminService::duplicateRecords](https://github.com/fisharebest/webtrees/blob/2.2.6/app/Services/AdminService.php)). It reports:

- sources with the same title;
- people with the same full name and the same date of `BIRT`, `CHR`, `BAPM`, `DEAT` or `BURI`;
- families with the same two partners;
- media with the same title.

Repositories are not checked ("We can't do any reasonable checks using MySQL").

## 4. GeneWeb

Version read: `master`; latest release v7.1.0-beta2 (2025-12-25). License GPL-2.0. Warning types are in [lib/def/def.ml](https://github.com/geneweb/geneweb/blob/master/lib/def/def.ml) and thresholds in [lib/checkItem.ml](https://github.com/geneweb/geneweb/blob/master/lib/checkItem.ml).

**It runs on import.** `ged2gwb`, the GEDCOM importer, calls `Check.check_base` after building the database. It prints every error and warning to its log, or stdout. `-nc` turns the check off, and `UndefinedSex` is suppressed at import ([ged2gwb.ml](https://github.com/geneweb/geneweb/blob/master/bin/ged2gwb/ged2gwb.ml)). This is the closest precedent for "part of the import's summary".

**Errors:** a person who is their own ancestor (`OwnAncestor`); bad sex of a married person; a person defined twice.

**Warnings**, with the constants from `checkItem.ml`. Where the comments in `def.ml` disagree with the constants, the constants are listed here.

- `BirthAfterDeath`. `DeadOld`: over 105 years when the death is after 1900, over 100 before.
- `MarriageDateBeforeBirth`, `MarriageDateAfterDeath`. `YoungForMarriage` under 12; `OldForMarriage` over 100. `BigAgeBetweenSpouses` over 50.
- `ParentBornAfterChild`, `IncoherentAncestorDate`. `ParentTooYoung` under 11. `ParentTooOld`: mother over 55, father over 70.
- `MotherDeadBeforeChildBirth`. `DeadTooEarlyToBeFather`: the child is born more than one year after the father's death.
- `CloseChildren`: siblings less than 7 months apart, except twins within 10 days. `DistantChildren`: siblings more than 50 years apart. `ChildrenNotInOrder`.
- `PEventOrder`/`FEventOrder`: person or family events out of order. Witness born after, or dead before, the event.
- `PossibleDuplicateFam`, `PossibleDuplicateFamHomonymous`. `IncoherentSex`, `UndefinedSex`. `TitleDatesError`.

The web UI also has a **data check page** (`CHK_DATA`, [checkData.ml](https://github.com/geneweb/geneweb/blob/master/lib/checkData.ml)). It runs over the lists of first names, surnames, places, sources, occupations and so on, and finds invisible characters, bad capitalisation, multiple spaces, non-breaking spaces, typographic errors and mixed scripts.

## 5. RootsMagic

Official help: [Problem search](https://help.rootsmagic.com/RM10/problem-search.html), [General settings](https://help.rootsmagic.com/RM10/general-settings.html), [Merging Sources and Citations](https://help.rootsmagic.com/RM10/merging-sources-and-citations.html) and [Database Tools](https://help.rootsmagic.com/RM10/database-tools.html). The help pages are filed under "RM10". rootsmagic.com advertises RootsMagic 12 today, and I did not check whether version 12 changed these pages.

**Problem List (reports only).** The help says it "shows you potential data entry problems in your database to help you detect errors before printing reports". The steps are People → Tools → Problem List, choose the problem types, then OK. The list shows the person's name and a short description. Its buttons:

- **Edit person:** "you will have to run Problem Search again to confirm the problem has been cleared";
- **Not a problem:** removes the item, and it stays off the list on later runs;
- **Add to Task list**;
- **Print**.

A separate **Not a problem list** (People → Tools) shows the ignored items and can put them back.

The help text doesn't list the problem types. Its screenshot of the options dialog ([rm9_tools-problemlist-1.jpg](https://help.rootsmagic.com/RM10/images/rm9_tools-problemlist-1.jpg)) shows these options, with the values that appear in it. I can't confirm that those values are the defaults.

- No sex entered.
- Proper order of events for person.
- Born before parent's marriage.
- Born before parent's birth.
- Born after father's death.
- Born after mother's death.
- Missing primary given name or surname, and the same for alternate names (the alternate-name options are unticked).
- Buried more than X days after death: **30**.
- Age at death should be less than **100**.
- Age at marriage should be between **14** and **70**.
- Father's age should be between **14** and **70**.
- Mother's age should be between **14** and **50**.
- An "Include" filter: Everyone, or a group.

The result screenshot ([rm9_tools-problemlist-2.jpg](https://help.rootsmagic.com/RM10/images/rm9_tools-problemlist-2.jpg)) shows texts such as "Mother 52 years old when person was born", "Parents married after person's birth", "Born after Christen", "Death after Burial" and "132 years old when died".

**Problem Alerts (in-app).** These are an indicator next to the name "of anyone who has a potential data problem". Clicking it lists that person's problems, with the same buttons. The alerts are turned on, and their problem types chosen, in Settings → General ([general settings](https://help.rootsmagic.com/RM10/general-settings.html)).

**Merging (changes data).** On the source list, "Merge all duplicate citations" "will automatically merge all citations which are exactly the same". "Merge all duplicate sources" does the same for sources.

**Database tools.** Test integrity, Rebuild indexes, "Clean phantom records (blank children in a family, families with no people)" and Compact.

## 6. Family Tree Maker (Software MacKiev)

What I could verify from a primary source is one paragraph on MacKiev's support site. The Data Errors Report (Publish → Person Reports) "shows where data is missing or where Family Tree Maker sees there may be a mistake on a person's record in your tree. To fix an error, double-click on a name in the report or edit the person's record in the 'People' workspace" ([Charts and Reports in FTM for Mac](https://support.mackiev.com/874811-Charts-and-Reports-in-FTM-for-Mac), answer 5261, covers FTM 2, 3 and 2017 for Mac).

The report's options and rule list are documented in the Companion Guide. MacKiev lists that guide as a PDF opened from the program's Help menu ([Support Resources](https://support.mackiev.com/742121-Support-Resources-for-Family-Tree-Maker-Users)), and I found no public copy on MacKiev's site. **Unverified:** the report's error types, its thresholds, whether errors can be ignored, and whether a "Find individuals with errors" command exists in current versions (FTM 2024, 25.0.2). User blogs describe "Person errors" and "Date errors" sections and a "possible duplicate event" check added in FTM 2019, but those are not primary sources.

## 7. MyHeritage Tree Consistency Checker (where this tree is edited)

Sources: the official [blog announcement](https://blog.myheritage.com/2017/02/new-online-family-tree-consistency-checker/) (2017-02-11) and the [MyHeritage Education article](https://education.myheritage.com/article/keep-your-family-tree-accurate-with-the-tree-consistency-checker/) (undated; image paths suggest 2019-08). The full list of checks is not published.

- It is reached from Family tree → Tree Consistency Checker and checks one tree at a time. It runs **36 checks**. Examples given: child born before parent; parent too young; full siblings born 5 months apart; person tagged in a photo dated before their birth; two-digit year; prefix in the first-name field; married surname entered as maiden name; a place that looks like a date; the same place spelled two ways; child born after the death of a parent; large spouse age difference; married too young; siblings with the same first name (a Notice, as a sign of a possible duplicate entry); and "alive but too old".
- **Thresholds** can be changed in Settings. "Died too old" defaults to **110**. The spouse age gap is configurable; the blog uses 38 and 50 as examples, not as defaults.
- **Severity:** Errors are "obviously incorrect" (red), Warnings "seem unusual and may be incorrect" (orange), and Notices are "a potential problem, but the likelihood of a mistake is smaller" (grey). Issues are grouped by check, with counts.
- **Each issue** shows portraits, a description that links to the profiles, a tip, an optional comment, and a photo where relevant. Some issues have a one-click fix.
- **Ignoring:** an X on an issue ignores it ("will not be reported again"). An X on a check's header disables the whole check; Settings turns it back on. Results are stored, and "Recalculate" reruns the check.
- It is also reachable from a person's profile.
- Full results need a PremiumPlus or Complete subscription. Other users see one issue per check.

## 8. MacFamilyTree / MobileFamilyTree (Synium)

Sources: the [MacFamilyTree 11.1 manual (EN PDF)](https://download.syniumsoftware.com/Manuals/MacFamilyTree_11.1_EN.pdf), [Tech Specs](https://www.syniumsoftware.com/macfamilytree/tech-specs) and the [Version History](https://www.syniumsoftware.com/macfamilytree/version-history). The current version is 11.3.4. MobileFamilyTree 11 shares the database and CloudTree sync, but I did not read its documentation separately.

- **Plausibility list** (manual §22.9). It "shows all of the items in your database that are unlikely to be correct". Examples: a father "seemingly only ten years old when his child was born", or a burial date before death "or, conversely, a long time after their death". The tech specs also list "Plausibility Tests for entered data" in edit mode and a "Plausibility Report". **The rule list and thresholds are not documented.**
- **Distinctive Persons list** (§22.10). This is a related "remarkable details" list with fixed thresholds: women with more than four children; lived over 80; died before 10; married before 18 or after 40; had a child before 18 or after 40.
- **Settings:** "Reset all suppressed warnings", which means plausibility warnings can be dismissed (§27).
- **Version 11.1 (2025-08-21):** "ToDos can now be created directly from plausibility warnings". The new ToDo Assistant "detects 'islands' in the tree where individuals are not connected to the main tree" and "detects recursions in the tree – e.g., if someone is their own great-grandfather".
- **Database Maintenance** (§16), which changes data or offers to:
  - find unreadable dates (a list to edit);
  - search for mismatched partners, such as a female father, with a "Repair family member mismatch" button;
  - find duplicates among persons, families, sources and places (with a similarity score, then merge);
  - remove empty entries.

## 9. Family Historian (Calico Pie)

Source: the FH7 online help, [family-historian.co.uk/help/fh7](https://www.family-historian.co.uk/help/fh7/). Family Historian checks mostly **at data entry**, not as a tree-wide report.

- **Entry-time validation.** "Warn of possible errors on data entry" is on by default. Leaving a field, or pressing F5, validates it and warns "if it appears to be invalid" ([General tab](https://www.family-historian.co.uk/help/fh7/preferencesdialoggeneraltab.html)).
- **What it warns about.** The [`GetDataWarning`](https://www.family-historian.co.uk/help/fh7/function_getdatawarning.html) function, available since FH 5, lists the warning kinds. At present all of them are about dates:
  - an invalid date (the 31st of a 30-day month);
  - born before a parent;
  - burial, cremation or probate before death;
  - a child at an unusually young or old age;
  - marriage at an unusually young or old age;
  - an event after death or before birth.

  The "expected" ages come from Preferences → [Estimates](https://www.family-historian.co.uk/help/fh7/preferencesdialogestimatestab.html), whose page doesn't state the default values. Each fact type also has a "Normal Time Frame" (pre-birth, post-marriage, …) used for these checks; "these warnings can be safely ignored if the dates … are in fact correct" ([Fact Definition dialog](https://www.family-historian.co.uk/help/fh7/factdefinitiondialog.html)). Because `GetDataWarning` is a query function, a query can list the warnings across the whole file.

- **GEDCOM import.** On loading a GEDCOM, Family Historian "will validate it, and can automatically check for, and correct, many errors" ([how-to](https://www.family-historian.co.uk/help/fh7/howto_compareanotherpersonsresearchwithyours.html)). Data it does not recognise becomes "Uncategorised Data Fields" (UDFs). Tools → Uncategorised Data → Find or Recover lists them or converts them, and writes a log ([Tools menu](https://www.family-historian.co.uk/help/fh7/menu_tools.html)). This is the nearest analogue to our "lines the import couldn't store".
- **Re-order Out-of-Sequence Data** (changes data). It reorders spouses, children and events into date order, optionally asking before each record.
- A standalone "Validate" command is mentioned in user-group posts, but I found no page for it in the FH7 help. **Unverified.**

## 10. Libraries and validators

| Project                                                                 | Lang / license   | Status                                       | What it checks                                                                    |
| ----------------------------------------------------------------------- | ---------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| [frizbog/gedcom4j](https://github.com/frizbog/gedcom4j)                 | Java / MIT       | last commit 2018-04, master `4.0.2-SNAPSHOT` | Structure and plausibility; see below                                             |
| [elliotchance/gedcom](https://github.com/elliotchance/gedcom)           | Go / MIT         | v39.6.0, 2023-11-06                          | `gedcom warnings <file>` CLI; see below                                           |
| [gedcom7code/js-gedcom](https://github.com/gedcom7code/js-gedcom)       | JS / MIT         | last push 2024-02                            | GEDCOM 7 structure only                                                           |
| [nickreynke/python-gedcom](https://github.com/nickreynke/python-gedcom) | Python / GPL-2.0 | v1.1.0, 2026-02-13                           | Parser only; `strict=True` raises `GedcomFormatViolationError` on malformed lines |
| [andy-z/ged4py](https://github.com/andy-z/ged4py)                       | Python / MIT     | tag v0.4.4, pushed 2026-09                   | Parser only (`ParserError`, `IntegrityError`, `CodecError`)                       |

- **gedcom4j** ([validate package](https://github.com/frizbog/gedcom4j/tree/master/src/main/java/org/gedcom4j/validate)):
  - Findings have a `Severity` (INFO, WARNING or ERROR) and a numbered `ProblemCode`.
  - `AbstractValidator.checkCitations` flags **any duplicate citation in an object's citation list as ERROR `DUPLICATE_VALUE`**, using `equals`, so the citations must be identical. It does the same for duplicate names, events, attributes, FAMC/FAMS links and so on.
  - Auto-repair is opt-in through an `AutoRepairResponder`. The default is `AUTO_REPAIR_NONE`, and each repair records a before/after copy.
  - Optional "supplementary" validators: `BirthsToYoungParents` (under 16), `BirthsToOldParents` (60 or over), `MarriedAtYoungAge` (under 16), `CouplesWithLargeAgeDifferences` (15 years or more), `BornBeforeAncestors`, `CircularAncestry`, `FutureBirthOrDeath`, `MaleWivesFemaleHusbands`, `MultipleChildrenWithSameGivenName`, `QuadrupletsAndMore`, `SimultaneousBirthsInMultipleLocations` and `DifferentSurnamesThanParents`.
- **elliotchance/gedcom** ([source](https://github.com/elliotchance/gedcom)) checks:
  - child born before parent;
  - incorrect event order;
  - individual too old: over `DefaultMaxLivingAge`, which is 100;
  - inverse spouses (husband and wife swapped by sex);
  - multiple sexes;
  - siblings born too close: under 274 days apart, and more than 2 days apart so that twins don't count;
  - unparsable date.
- **GEDCOM 7.** I found no validator published by FamilySearch itself. The spec site's [tools page](https://gedcom.io/tools/) lists third-party ones:
  - ged-inline.org;
  - ArmidaleSoftware/gedcom7 (C#, MIT, "Compatibility checker");
  - cartwrightdj/gedcomtools (Python);
  - the Magikey web tools;
  - js-gedcom's [web validator](https://gedcom7code.github.io/js-gedcom/);
  - lavich/domorium (TypeScript, MIT, an IDE plugin);
  - gedcom.tools.

  js-gedcom checks out-of-place tags, cardinality, malformed payloads, enumeration values and pointer types against the [GEDCOM-registries](https://github.com/FamilySearch/GEDCOM-registries). It also warns about undocumented or deprecated extensions. It checks no dates or plausibility.

## Thresholds side by side

| Check                      | Gramps     | LifeLines        | RootsMagic (screenshot) | GeneWeb                      | MyHeritage         | gedcom4j                 | elliotchance                |
| -------------------------- | ---------- | ---------------- | ----------------------- | ---------------------------- | ------------------ | ------------------------ | --------------------------- |
| Max age at death           | 90         | 90               | 100                     | 100 / 105 after 1900         | 110                | –                        | 100                         |
| Min age to marry           | 17         | 18               | 14                      | 12                           | configurable       | 16                       | –                           |
| Max age to marry           | 50         | 50               | 70                      | 100                          | –                  | –                        | –                           |
| Mother's age               | 17–48      | 18–45            | 14–50                   | 11–55                        | "too young"        | 16–60                    | –                           |
| Father's age               | 18–65      | 18–60            | 14–70                   | 11–70                        | "too young"        | 16–60                    | –                           |
| Spouse age gap             | 30         | 20               | –                       | 50                           | configurable       | 15                       | –                           |
| Birth after father's death | > 294 days | dead at birth    | after death             | > 1 year                     | after death        | "may have been deceased" | –                           |
| Siblings too close         | –          | same year        | –                       | < 7 months (twins ≤ 10 days) | 5 months (example) | –                        | < 274 days (twins ≤ 2 days) |
| Burial after death         | > 14 days  | after death year | > 30 days               | –                            | –                  | –                        | –                           |

## What's reusable here

**Ranked checks for `scripts/check-tree`.** Each one reports; none corrects.

1. **The same citation more than once on a person or family** (error when identical, warning when only source and PAGE match). Group by `(scope, source_id, page)`; call the group "identical" when `text` and `quality` match too. That is webtrees' word-for-word rule, and gedcom4j's ERROR. A group that differs only in text is the weaker signal, like Gramps' Merge Citations key (page + confidence), and some of the 22 non-identical groups may be meant. Our import stores only record-level `SOUR` lines, not event-level ones (`importCitations` in `src/server/gedcom-import.ts`), so a repeat can't be explained as the same record cited for two different events.
2. **The same person in a family twice** (error): a child listed twice, or a person who is both partner and child. Sources: LifeLines `mulchl`, webtrees "Remove duplicate links", gedcom4j duplicate FAMC/FAMS. Gramps Check and Repair silently removes these, so the report is the only place this mistake would show.
3. **Impossible order in one person's dates** (error): death before birth, burial before death or birth, baptism before birth, marriage before birth or after death. All tools have these (Gramps rules 1–6, 18, 19; LifeLines; RootsMagic "event order"; GeneWeb).
4. **A child's birth against a parent's dates** (error): born before a parent; born after the mother's death; born more than 294 days after the father's death (Gramps' value). Present in Gramps, RootsMagic, GeneWeb, gedcom4j, elliotchance and MyHeritage.
5. **Siblings born too close** (warning): less than 274 days apart, unless within 2 days (twins). Source: elliotchance, with GeneWeb using 7 months and 10 days. In church-book data this often points to the same child entered twice, or a misread year.
6. **Parent's age out of range** (warning): under 14, mother over 50, father over 70. This matches the RootsMagic screenshot and sits between Gramps' tighter and GeneWeb's looser bounds, which keeps it quiet on 18th–19th-century families. Make the bounds settings, as every tool does.
7. **Age at death over 100** (warning). Source: RootsMagic and elliotchance; GeneWeb uses 100/105, MyHeritage 110. Gramps' 90 is too noisy.
8. **Dates the import couldn't parse, and lines it couldn't store** (warning). Sources: Gramps invalid date, elliotchance unparsable date, MacFamilyTree "find unreadable dates", Family Historian UDFs, webtrees custom-tag warnings. This is the ticket's fourth candidate check.
9. **Born before the parents' marriage** (notice). Source: LifeLines `illeg`, RootsMagic. It is common in real records, so keep it low and off by default.
10. **Disconnected people** (notice). Gramps defines it as no parents and no families; MacFamilyTree finds "islands". This is cheap, and it surfaces leftovers of merges.

Not worth it here:

- same surname for husband and wife (Gramps 16), and child's surname differs from the father's (LifeLines `nonpat`): normal under Finnish naming;
- unknown gender;
- married often or too many children;
- baptism "too late by family tradition";
- duplicate-person scoring: MyHeritage already does this where the tree is edited.

**Report or in-app?** Every tool surveyed runs the whole-tree check as a separate, on-demand list. The list is a results window in Gramps, an admin page in webtrees, the Problem List in RootsMagic, a report in FTM, a checker page in MyHeritage and a list in MacFamilyTree. GeneWeb's import is the one place a check runs on import, and it writes to a log. Per-person indicators come on top of the list, not instead of it: RootsMagic Problem Alerts, MyHeritage's link from a profile, Family Historian's entry-time warnings. Tools that change data are separate commands, and they warn first.

So, for this ticket:

- Start with **a script** that writes an HTML report into `data/`, like `deaths-to-resave.html`, and run it after each import. That follows GeneWeb's import-time check and LifeLines' habit of diffing against a reference report.
- Group rows by severity, then by check, and show a count for each. Give each row the person's name, what is wrong with the recorded values side by side, and a `#/person/<id>` link. All the tools link each finding to the person.
- Give each finding a stable key of check, record and parameters, as Gramps does. A later local "not a problem" list in `data/` (RootsMagic, MyHeritage, Gramps) can then hide findings across re-imports, and a changed threshold brings them back.
- An import summary in the app could later show only the counts, with a link to the report, much like Gramps' "Integrity Check Results".
- Leave plausibility checks that MyHeritage already runs where the tree is edited to MyHeritage, unless they are cheap. The checks no surveyed checker covers are **duplicate citations and the import's own gaps**, which are 1 and 8 above.

## Open questions

- Which of MyHeritage's 36 checks overlap ours, and does it check duplicate citations at all? (Its full list isn't published; it would have to be checked in the product.)
- What do Family Tree Maker's Data Errors Report options and defaults look like in FTM 2024? (They're only in the in-app Companion Guide.)
- Are RootsMagic's screenshot values (30 days, 100, 14–70, 14–50) its defaults? (The help text doesn't say.)
- In the 22 non-identical duplicate groups, what differs: the text only, the quality, or the date inside the text? That decides whether "same source and PAGE" alone is an error or a warning.
