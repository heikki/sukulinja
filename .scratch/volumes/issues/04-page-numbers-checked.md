Status: resolved
Blocked by: 03

# Page numbers checked

Heikki, 2026-11-19: Vision Match makes no sense on a Volume whose page numbers are wrong, so one should be able to mark them checked.

- One mark per Volume, the install's, kept beside its Page pins (pins.local.json), so every dataset sees it.
- Marked and unmarked from the _All books_ table's row menu; its Pages column says not read / read / checked.
- Checked, the Scan viewer's page numbers are locked; unmarking opens them again.
- Vision Match on a Volume not checked asks first.
- Nothing more until it's been tried: "ei mitään turhan monimutkaista".

## Built

`checked` on the Volume in pins.local.json; `checkPages` / `pagesChecked` among the app's operations. Marked from _All books_ (a ✓ button; the Pages column says –, Read or Checked) and from the Scan viewer's menu (Mark / Unmark page numbers checked). Checked, the page bubble shows the page with a ✓ and can't be edited; setting, clearing and surveying are refused by the server too. Vision Match on a Volume not checked asks first ("Locate anyway").
