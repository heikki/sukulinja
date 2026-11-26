Status: done

# A save refused when the tree changed since its lines were listed

ADR-0037. The Entry pane's lines come with the last Change's id when they were worked out; the save sends it back, and the server refuses with "The tree has changed since; look at the list again." if a Change is newer. Replaces `entryLines.ticked` asking for the lines again at save, which ticked a line that appeared meanwhile without it being seen. If refusing on any Change proves too strict, narrow it to the owner's person or family `change_date`.
