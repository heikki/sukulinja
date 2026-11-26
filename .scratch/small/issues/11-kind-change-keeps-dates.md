Status: needs-triage

# A kind changed in the Entry pane keeps its dates under other labels

An Entry's two dates are stored as `date` and `lifeDate` whatever its kind, so changing a baptism to a burial shows its Born as Died and its Baptised as Buried, and offers _Add fact: Death_ ticked. Found while building ADR-0037 (Heikki, 2026-11-26). Clearing them on a kind change would lose dates typed right when the kind was chosen wrongly; undecided.
