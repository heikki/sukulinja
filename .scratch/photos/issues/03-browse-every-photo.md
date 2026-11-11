Status: ready-for-agent
Blocked by: 01, 04

# Browse every Photo in a Photos view

Spec: `../spec.md`. Glossary: **Photo**, **Photos**, **Photo viewer**, **Church books**.

Heikki, 2026-11-11: browsing all photos, "vähän niin kuin oikeassa ylänurkassa oleva kirkonkirjojen valikko", since a Photo may be linked to no one or have no one tagged yet.

A **Photos** view opened from the top-right corner beside **Church books**, listing every Photo of the dataset as thumbnails, with how many people each is linked to or tagged in. Picking one opens the Photo viewer on it with no person.

Photos linked to no one are kept by the import from ticket 04 (Heikki, 2026-11-11).

Order (Heikki, 2026-11-11): Photos with no one linked or tagged first, then the rest as the import listed them, as **Church books** puts the most cited first.

## Done when

- The Photos view lists every Photo and opens each in the Photo viewer.
- Checked in `bun dev` in dark mode.
