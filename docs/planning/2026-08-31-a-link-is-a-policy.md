# A link is a policy — ADR-0213's tenth pass

**Date:** 2026-08-31
**Subject:** the owner asked for three privacy options at once instead of one. The answer turned out to delete a mechanism rather than add one, costing it found a defect that is already live — and the first drawing was wrong in a way the owner caught in one sentence.

## What came in

> _"I want to change the trip sharing infra and sharing design. I want to be able to share with different privacy options (summary, full schedule, everything), and not choose only one. Different links, maybe link generated per viewing option idk. We need to mockup this and think how to do this."_

Drawn first in [`a-level-is-a-link-not-a-setting-v1.html`](../../mockups/a-level-is-a-link-not-a-setting-v1.html), corrected in [`a-link-is-a-policy-not-a-level-v2.html`](../../mockups/a-link-is-a-policy-not-a-level-v2.html). The decision is [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s tenth amendment, §1–§7, written against v2, and it was **built the same day**.

## The correction, and it took the owner one sentence

v1 keyed links on `detailLevel`. The owner read it and asked:

> _"The הכל category could have different levels of detail based on what you allow, so maybe for that there could be multiple different links. Have you taken that into consideration?"_

It had not, and the miss is not a missing edge case — it is **counting the wrong thing**. A level does not determine a projection. Summary and Full have one policy each because there is nothing in them to tune; Everything is a family of `2³` sensitive combinations times every subset of the trip's files. A sister who needs confirmation codes and a hotel that should see only names are both Everything.

Once that is said, the rule writes itself: **a link per policy**, with the counts 1 / 1 / many _derived_ rather than declared. v1 is the special case where the level happens to be sufficient.

What makes this worth writing down is that v1 had already read the schema, the service and the sheet — including the three `include*` booleans and the `TripShareDocument` join — and still keyed on the level. The fields were in front of me and I did not ask what they were _for_.

> Before keying anything, enumerate the space it is keying. "One row per X" is a claim about how many distinct configurations X can produce, and the way to check it is to count them, not to read the column name.

The correction also made the design _better_ rather than bigger: it deleted the auto-save entirely where v1 had only halved it, and it turned three hand-written cardinalities into one rule.

## The finding: this is a removal

The request reads like "add links". Reading `ShareItinerarySheet.tsx` first turns it into something better.

§5 gave the trip one link and made the level a **setting** on it. The third pass (2026-08-30) then had to make that setting write immediately — a debounced `upsertTripShare`, plus `levelSaved` (`הלינק החי מעודכן · תקציר`) whose only job is to say out loud that the link just changed under whoever already holds it. Both exist purely because one link carries a level. They are the smallest honest repair to a model that cannot serve two audiences, not features anyone wanted.

Make the _policy_ the link's identity and all of it goes: no draft, no debounce, no announcement, and no way for a URL in someone's hands to start showing something else. v1 only got half of this — it kept the debounce for the Everything toggles, since those still mutated a live link. Under a policy key **nothing in the sheet mutates a live link at all**. **The proposal is less code than what ships**, and Summary's branch renders at exactly today's height, 525.6px against 525.6px.

It also inverts the sentence that put the auto-save there. The third pass reasoned that _"a link that is already live is already showing something to whoever holds it, so the honest model is that moving the control moves the link."_ That is true of a trip with one link. With one link per audience it reverses: a live link is a promise made to a **named audience**, and a promise that changes silently is the defect, not the fix. Same premise, opposite conclusion, because the cardinality underneath it changed.

The generalisable form:

> When a request asks for a capability, check whether the thing blocking it is a repair. A mechanism that exists only to make a limitation survivable is not load-bearing; it is the limitation's shadow, and it leaves with it.

## The other finding: the migration is free, and the schema said so

`TripShare` already stores the whole policy on the row — level, the three booleans, and the files through a join. The key becomes `@@unique([tripId, policyHash])` over a stable hash of all of it, which is the technique `ItineraryNarrative.inputHash` already runs _in the same module_. Every existing row gets a hash and keeps its `code`, so **no data moves and no shipped `/s/<code>` stops resolving** — and `PUT` stays idempotent, which is what lets the sheet keep having no Save button. `upsertTripShareSchema` already carries every field of the policy, so the request body does not change, and today's `DELETE …/share` ("stop sharing this trip") is already exactly the stop-all the design needs.

That was written down a year of sessions ago: the schema comment at `TripShare` says _"One row per trip (`tripId @unique`) is the v1 decision … several independently revocable audience links is an access-management feature"_, and the backlog line repeated it. **A deferral that names its own lift is worth more than one that just says "later".**

## Costing it found something already broken

Three links means up to three `ItineraryNarrative` rows, since the cache is keyed by `shareId`. Chasing whether that could be deduplicated found that it should never have been per-share: the narrative input is built from _this_ projection's days, and `placeName` is set only after the Summary early return — so **the same trip already generates a different narrative depending on which level opens it, today, with one link**.

The fix is two lines of policy (key on `tripId`; include `placeName` at every level, which is Summary-public already since it reaches the model through `routeLabels`), and it is correct with or without multi-link. It is in the backlog as its own item, not buried in the feature's.

## What the render found, which reading could not

The measurement table first reported the sheet's group gap as **12px**. The app's is 16px, and the ADR says so.

`.modal-form` sets `gap: var(--space-3)` and `.share-sheet` sets `gap: var(--space-4)` — both a single class, so the winner is decided purely by which stylesheet is emitted last. My manifest listed `screens.css` first, copied from `sharing-and-inviting-are-one-control-v1.html`, which lists it first too. The app's order is the opposite: `App.tsx` imports `screens/Home` at :64, which reaches `HostTasks` → `TaskSheet` → `FormActions` → `form-actions.css` long before its own `import './screens.css'` at :113.

The previous file never saw this because its own proposed block re-declared `.share-sheet { gap: var(--space-4) }` on top of the inlined cascade — it was measuring its proposal, which happened to be the right number, for a reason that had nothing to do with the manifest. **An inlining mockup's manifest is not a list of sheets it needs; it is a claim about the app's cascade**, and a specificity tie is where a wrong claim shows up.

## Building it corrected the drawing three times

**The spec's own §6 was wrong, and the schema said so.** The amendment promised to include
`placeName` at every level to make the generator's input level-invariant. Both ways of doing
that are worse than the alternative: adding it to the Summary projection changes what a
Summary link _publishes_, and projecting a second time to feed the generator doubles the work
on every public read. Deleting the field is level-invariant by construction and is _less_
crossing the model boundary. What settled it was reading `summaryNarrativeInputSchema`'s
docblock, which has claimed level-independence all along — `placeName` was the one field
breaking its own stated contract.

> A cache key that will not deduplicate is usually telling you the input is wrong, not that
> the key is. The fix was upstream of the thing I set out to fix.

**A specificity tie hid the danger tone, for the third time in this sheet.**
`.share-stop-all { color: var(--miss) }` lost to `.share-manage { color: var(--muted) }`
several hundred lines below — same one-class weight, later rule wins — so the stop-all
rendered grey in the running app while every unit test passed. The sheet's `gap` is the same
shape of bug twice already. The rule worth carrying: **a rule describing a variant of an
existing class must name both classes, or it is betting on file order.** It is guarded now on
the computed colour in a real engine, because nothing in jsdom resolves a cascade.

**A failed read used to read as "not shared".** Swallowing the error was nearly harmless when
absent and failed looked the same; with a list they are opposite claims, and the wrong one is
the dangerous direction — an owner told nothing is published while three links are live. Found
by an e2e fixture whose `documentIds: ['d1']` failed `entityIdSchema`'s 8-character floor, so
one bad element silently dropped every sibling with it.

## What was proven rather than asserted

The riskiest claim was "no shipped link stops resolving". It is now checked end to end: a row
inserted with the migration backfill's own SQL expression resolves publicly, and a `PUT` of
that same policy returns **that row's code**, with one row on the trip. The SQL and the
TypeScript compose the same canonical string, and `share-policy.spec.ts` pins two literal
digests taken from Postgres so the duplication cannot drift in silence.

## Forks put to the owner, and the answers

The design forks were settled before the build; three are named in the mockup's notes panel and the amendment's §7, with a recommendation each:

1. **Level-keyed links (recommended) against arbitrary named links.** Named links are the backlog's real access-management item and need a label field, a list screen and a divergence policy; the question asked is answered in full without them, and the schema path stays open.
2. **The live mark's hue** — `--ok` recommended, from rule 4 rather than taste: a live link is a status, and `--cta` resolves to `var(--ink)` in light where it merges with the selected card's own ring. Both are a control in the file.
3. **The mark's diameter**, 7px against 9px, left to a device pass because a dot's weight cannot be settled in a desktop screenshot.

One more was decided rather than asked, and is worth flagging: **editing a live link's policy in place is not offered**. Under a policy key it is incoherent — a changed policy is a different link — so "let my sister also see notes" is a new link plus stopping the old, two presses. That is a real cost and it buys the §2 inversion: a promise already handed over does not change behind the recipient's back.
