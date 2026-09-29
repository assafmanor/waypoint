# 2026-09-29 · A list leaves the trip (6A.4, design)

## The ask

"Continue to the next step", which is epic item 6A.4: a list share scoped to a category (spec 3e, "Our Tokyo food list" to a friend going next month). There was no design for it beyond the spec's one line.

## Forks put to the owner, and the answers

- **Design first, or build on defaults?** Design first: an ADR and a mockup to review, then the build in its own PR.
- **Where does a list share start?** From the memory Home's kind filter.
- **What does the list hold?** Only what the group did (`recapHappened`), each row with its place.

## What reading the code changed

- The Home's kind filter is no longer a list: since ADR-0240 §4 its chips open `RecordSearch` on that kind. So the send goes at the foot of that search, and nothing new is drawn on the Home.
- Summary drops the place name and map link at the projection (`base` is returned first), so "a Summary share" as the spec says it would send restaurants with no name for where they are. ADR-0242 lets a list row carry the place facts. Summary withholds them because of a live trip's whereabouts, and a list is sent from a finished trip.
- Appending the scope to the hash's canonical string only when scoped keeps every existing link's hash, so the migration needs no backfill.
- The share sheet's per-level logic has to filter list links out, or a list would read as the trip's Summary link.

## What rendering changed

- The reader's `.sh-dates` line is set in mono and prints a Hebrew sentence, which is the web twin of the book's squares (#899). It is recorded as ADR-0242 §5 and fixed in the build.
- At 360×640 the send sits 136px below the fold under nine rows. It stays at the foot, because the owner reads the list before sending it.

## Next

The owner reviews ADR-0242 and the mockup; the build follows in its own PR.
