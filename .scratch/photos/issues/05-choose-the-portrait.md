Status: ready-for-agent

# Choose a person's portrait

Spec: `../spec.md` (Later: choosing the portrait). Glossary: **Photo**, **Tag**, **Box**, **Photo viewer**. ADRs: 0013, 0017, 0020.

Heikki, 2026-11-11: "Olisi kätevä, jos voisi valita profiilikuvan."

Today the portrait in the chart and the panel header is always the person's first photo by link order, cropped to their Box on it (ADR-0017). An import puts the photo MyHeritage marks `_PRIM` first (ADR-0013), and nothing in the app can change which one it is.

## Decisions

- **Chosen from the Photo viewer's menu.** A person's Box gets _Use as portrait_ in its right-click menu, beside _Edit_ and _Delete_. It isn't there on the Box of the photo that is already their portrait. Only a Tag has a Box, so only a Photo the person is tagged in can be chosen, and the portrait always has its crop.
- **Stored as link order.** Choosing moves the person's link to that Photo to the front of their links. In GEDCOM 7 the first one is the preferred one. The portrait query and the GEDZIP export read the order as they already do, so the export writes the chosen photo first.
- **No merge rule.** The tree is no longer edited in MyHeritage (Heikki, 2026-11-11), so no re-import from there needs to keep the choice. A GEDZIP the app exported keeps it through the link order. No schema change.
- **Taking back the Tag** of the chosen Photo removes its link, so the portrait goes back to the person's first photo by order, as it would for any other photo.
- **A Change** on the person: "Chose the portrait", with the Photo as its detail, as a tag Change has.

## Done when

- _Use as portrait_ on a person's Box makes that Photo, cropped to the Box, their portrait in the chart and the panel header right away.
- The GEDZIP export writes that Photo first among the person's `OBJE` links.
- Importing that GEDZIP gives back the same portrait.
- The choice shows in Changes.
