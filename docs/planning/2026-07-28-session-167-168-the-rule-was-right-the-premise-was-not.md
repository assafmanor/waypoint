# Sessions 167–168 — the rule was right, the premise was not (2026-07-28)

Two device-pass rounds on the map tab's search, in the same day as sessions 165–166. Every
fix is recorded in the ADR it belongs to — [ADR-0132](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md)
§6's amendments and [ADR-0134](../decisions/0134-the-map-is-where-a-forms-place-comes-from.md)'s
third build-log addendum. This note is for the one thing that spans them, because it is a
pattern rather than a bug.

## Three defects in a row were true rules resting on false premises

None of these was a wrong decision. Each was a correct rule whose **premise** had quietly
stopped holding — and in each case the premise was a sentence in an ADR that nobody had
reason to re-read.

| The rule                                                | Its premise                                       | Why it stopped holding                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A result the trip owns gets no ring (ADR-0132 §6)       | "It already has a pin"                            | Our matcher is a normalised substring; Google's does transliteration. `מון` finds `Moon Sushi Bar Pinsker` for Google and not for us, so the pin had been filtered away. |
| The errand return fires once (session 165)              | "The channel is once-only"                        | True of the channel, false of the **effect** built on it — each host's effect also depended on `events`, which changes on every save.                                    |
| Every trip pin is context under an errand (session 166) | "Nothing on this canvas is what you are choosing" | False the moment a query is live: the pins that survive the filter are exactly what you are choosing.                                                                    |

The shared shape: **a rule stated in terms of a fact about another part of the system.** Each
was true when written. Each became false when that other part changed — a SKU switch, a new
hook shape, a new mode — and nothing failed loudly, because the rule still read as sensible.

The practical lesson for this repo, which already writes down _why_ generously: **when a rule
rests on a fact, the fact is what to assert in a test**, not the rule. "A result the trip owns
gets no ring" passed its test throughout; what nothing asserted was "and its pin is on the
canvas". Session 167 added exactly that test and verified it failed before the fix — worth
the minute, and worth doing again.

## Half a fix reads as no fix

Session 167 fixed the canvas and left the list. The owner reported the _same words_ back
(_"still don't see existing places on search"_), because from the outside there was no fix:
you still could not see your own place when you searched for it. The predicate existed in two
places and only one was corrected.

Where a rule has two halves — a canvas and a list, a pin and a row — fixing one is not
progress toward fixing both, it is a state that has to be re-reported. Both call sites in one
change, or neither.

## An accidentally-correct fix is still wrong

The first attempt at the demotion exemption switched it off whenever a query was live. That
is right **today**, because under a query every pin on the canvas is a match — but only by
coincidence of the filter, and it would have promoted anything the canvas carried for any
other reason later. The owner's correction (_"not every trip pin, just search results that are
already saved"_) is the better rule, and the file already had the shape for it: ADR-0131 §4
had put the `aside` withdrawal **on the pin** for exactly this reason a phase earlier.

Reaching for the screen-level switch when a per-pin flag already existed is the same failure
rule 8 names — a second mechanism beside one that was already doing the job.

## What is still open

Unchanged: **ADR-0134 §9** (the Map's own `＋ מיקום` is `PlacePickerSheet`'s last caller,
needing a fourth errand target — a coordless `Place` enriched in place, a row rather than an
entity field), and the **coordless match** at the map extreme, which ADR-0132 §8 named when
the stop reopened.
