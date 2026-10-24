# The report that was about the feeling (2026-08-31, session 258g)

Eight reports on the sixth pass. One of them closed a line that had been open since the
first, and the way it closed is the reason for this note. Decisions in
[ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
seventh 2026-08-31 amendment.

## Four rounds proving the wrong thing

The owner reported _"the document links aren't working"_ on 2026-08-30. Over three passes I:

- fixed a real defect (a saved file had no extension, because a document's name here is its
  title and a title has no extension);
- fetched the route against production and showed a clean 404 for an unknown id;
- downloaded the PDF through the apex→www redirect and read back a correct filename;
- measured the rendered anchor at a 44px target with the right href and a `download`
  attribute;
- and each round wrote "still unreproduced" into the backlog, honestly.

Every one of those was correct. On the fourth round the owner wrote one more sentence: _"it
simply downloads in the background, giving no indication that it's downloading or that it was
downloaded successfully."_

**The links worked the whole time.** On a phone the download shelf is a notification you may
not see, so a tap that succeeds and a tap that does nothing look identical. I had been proving
the mechanism while the report was about the experience of using it, and the two never met
because I read "does not work" as a claim about the mechanism.

`frontend/CLAUDE.md` already carries this shape once, from ADR-0195 §4: a complaint about a
control's appearance after an interaction, twice closed by asserting the control's state. Same
error, different surface. **A report about what a control feels like is not answered by proving
the control functions.**

The cost was not the fix — the fix is a fetch, three states and some copy. The cost was three
rounds of measurement that could have been one question: _what do you see when you tap it?_ I
asked that once, early, and then kept measuring when no answer came instead of asking again.

## A threshold moved the seam; the model fixed it

The sixth pass capped a journey chain at six hours so a return would stop swallowing the
trip's last day. The owner's real layover is 5h20m. It folded anyway.

Shaving the number again would have moved the seam a third time. What was actually wrong is
that the return **does** occupy both dates — 02:00 out of Iceland, 15:25 into Tel Aviv the next
afternoon — and the projection had no way to say so. `SharedDay.endDate` says it, and the card
header reads `21–22`. The owner proposed it (_"maybe the days should be combined to one"_) and
it is a better model than any threshold, because it describes the trip rather than tuning
around it.

## The seventh time

`.pdf-ops-line` set the `font` shorthand and lost `'Noto Emoji'`, so an emoji in a note printed
as an empty rectangle. The same shorthand ate the Hebrew face on `.pdf-subtitle`, and ate a
size on this very rule one pass ago.

The rule now written into the file: **prefer `font-size` and `font-family` as separate
properties.** A shorthand that silently drops a family is not worth the characters, and a spec
asserts both that the emoji face is in this stack and that the rule does not use the shorthand
at all — the second assertion being the one that prevents a recurrence rather than detecting it.

## The move that turned out to be cheap

The sixth pass backlogged "move the note parser to `packages/shared`" as needing `bidi.ts` and
its ~40 consumers to come along — a refactor to ask about rather than take silently. Asked and
taken this round, and it cost three `git mv`s and three re-export shims: every existing import
kept working untouched, which is the same trick `place-label.ts` used.

The one interesting part was `URL`. `packages/shared/tsconfig.json` sets `lib: ["ES2022"]` and
no `types`, deliberately — it is what makes `document` and `process` fail to compile in a
package whose contract is that it talks to neither. Adding `DOM` or `@types/node` to reach one
constructor would have opened that door for everything, so `platform-url.d.ts` declares exactly
the members used. A future dependency on some other global still fails the build.

## A ninth report, and the shape it shares with the first

_"The live share should not inherit some of the app's quirks: it should be able to refresh,
zoom in/out etc."_

The same shape as the download one, a level up. Everything the shared page inherits from the
app — no zoom, no pull-to-refresh, `touch-action: manipulation` — is a deliberate decision
(ADR-0062) that is right for an app and wrong for a document a stranger opens in a browser
tab. Nothing was broken; a posture was applied where it did not belong.

Worth noticing because the page has now been through seven passes of design work and this
never came up: it is invisible from inside the app's own frame of reference. The escape hatch
already existed for the image preview, which suggests the question to ask on any surface that
renders outside the shell — _which of the app's global postures does this surface not want?_

## Left open

- Nothing from this round. The document-link line finally leaves the backlog.
