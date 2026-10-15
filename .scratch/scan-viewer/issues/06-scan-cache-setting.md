Status: ready-for-agent

# Scan cache setting

Part of `../PRD.md`. Needs 01.

## What

- The cap is kept on the server in the data folder (beside
  `anchors.local.json`, in `settings.local.json`), defaulting to 2 GB.
  It belongs to the install, not one viewer, so it isn't a cookie.
- A route outside any dataset, e.g. `GET /settings/scan-cache` returning
  `{ cap, used }`, `PUT` to set the cap (pruning at once), and `DELETE` to
  clear the cache.
- A Scan cache row in the Settings popover shows the space used, offers
  1 / 2 / 5 / 10 GB, and has a Clear button.

## Done when

- Choosing a smaller cap shrinks the cache to fit, and the row shows the
  new space used.
- The cap survives restarts.
