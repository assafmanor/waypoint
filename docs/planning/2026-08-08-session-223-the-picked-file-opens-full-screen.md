# Session 223 — Workstream G1: the file you picked opens full-screen, in the viewer that already exists

**Date:** 2026-08-08
**Branch:** `claude/filepicker-full-preview-mkmdh0`
**Scope:** field report #19 from [session 216's triage](2026-08-07-session-216-field-reports-triage.md) — Workstream G1, classified there as Class C: a **feasibility/design pass first, then build**. Feasibility answered yes, so this session is both. Frontend only. No new component, no backend/shared/schema change, no mockup. [ADR-0086](../decisions/0086-document-upload-pick-control-redesign.md) amended in place.

## The question this session existed to answer

The owner's requirement was settled (triage §3): _the full selected document must be inspectable before Save, not a thumbnail_. What was **not** settled was the mechanism, and the triage named the specific risk — that reuse might not stretch, and the session would end up scoping "a smaller new surface". So the first job was to find out whether [`MediaViewer`](../../frontend/src/ui/MediaViewer.tsx) can serve a local, not-yet-uploaded `File`.

**It can, with one branch.** The reason is a fact about the types that turns out to decide the whole design: **a `File` _is_ a `Blob`**. The viewer's read effect already ends in `URL.createObjectURL(blob)` → decode → `setUrl`, so the only thing the sources disagree about is **how the blob is reached**:

| Source                             | How the bytes are reached                     | Object URL | Version key            |
| ---------------------------------- | --------------------------------------------- | ---------- | ---------------------- |
| `blob` (saved document)            | `fetchDocumentContent` — auth-guarded, cached | yes        | `updatedAt` (ADR-0055) |
| `url` (enrichment photo)           | already public and immutable                  | no         | the URL itself         |
| **`file` (picked, unsaved)** — new | **already in hand**                           | yes        | the `File` object      |

So the variant is `Promise.resolve(localFile)` where the document path has a fetch, and **every line after that is shared**. What the pre-save look inherits by being the same component, rather than re-earning: the portal, the ONE close that back / Escape / the Android gesture / the backdrop all run through (ADR-0103 §2), the focus trap, the grow-out-of-what-you-pressed arrival, ADR-0062's pinch-lift, and ADR-0052 §1's decode-failure hand-off.

Three things the variant deliberately does **not** get, all for the same reason — there is no read in front of it:

- **No cache.** There is no id to address and no `updatedAt` to key ADR-0055's blob cache on.
- **No deadline.** [Workstream G2](2026-08-07-session-222-document-read-reliability-built.md) bounded eight awaits because a read can go quiet; a `Promise.resolve` cannot. Adding a bound here would be ceremony against a phase that does not exist.
- **No failure state.** `setFailed` is unreachable on this path, so `ErrorState`'s retry (G2's work, untouched) simply never renders for a picked file.

The decode step **is** kept, and that is not an oversight: it is where a picture's dimensions first exist, so the frame is right before the `<img>` mounts, and G2's "a decode that fails and one that never answers mean opposite things" branch keeps working unchanged for a HEIC the browser cannot render.

## What shipped

**`MediaViewer.tsx`** — `ViewerSource` gains `{ kind: 'file'; file: File }`, and the read effect's fetch becomes a two-way choice of where the blob comes from. Diff is a source line, a dep, and the comments that say why.

**`FilePicker.tsx`** — the preview card's thumbnail + name + size become one pressable **open-body** beside the ✕, which measures itself with `overlayOriginOffset` and opens the viewer at `{ kind: 'file', file: value }`. That is [`ListRow`](../../frontend/src/ui/domain/ListRow.tsx)'s grammar — a tappable open-body with a trailing control — and the same gesture a **saved** document's row already uses to reach this same viewer.

`ListRow` itself was considered and rejected, on three counts rather than taste: it lives in `ui/domain`, and a `ui/primitives` component must not depend on it; its trailing control is a `⋯` kebab where this is a clear; and its leading slot is a `PlaceBadge` where this is a decoded thumbnail with a decode-failure fallback. Borrowing the shape without the component is the right amount of reuse here.

**Two object URLs over one file, and neither may free the other's.** The card keeps its thumbnail while the viewer is open, so a shared URL revoked on close would blank the card behind it. Each owner creates and revokes its own; `FilePicker`'s existing revoke-on-change/unmount effect is untouched, and the viewer's cleanup already revoked its own. The same effect now also **closes the full view when the file changes or clears** — swapping a file is clear + re-pick (ADR-0052's amendment), and a view left open would be showing the file that is no longer picked.

**Copy:** `filePicker.view(name)` → `תצוגה מלאה: ${name}`. A function, not a constant, because `aria-label` **replaces** a button's content — labelling only the action would have dropped the filename that is the visible label.

**One mark of new design:** the `frame` icon (four corner brackets, already the app's fit-to-content mark) in the thumbnail's trailing-bottom corner. Phone-primary means no hover to discover a new affordance with (ADR-0017), and the card had been terminal for three weeks, so it owes one visible sign that it is now a way in. The open-body takes `--press-scale-lg` (a row-sized surface, not a control) and the ✕ beside it keeps the control step.

## The caveat, stated rather than papered over

**A PDF gets a hand-off, not an inline render.** `MediaViewer` shows inline only what the browser decodes as an image (ADR-0052 §1); a PDF — and an undecodable image, an iPhone HEIC — lands on `פתיחה` / `הורדה` instead. So for a PDF, "full preview before saving" is one tap further out, in a browser tab, and the app's own surface is a hand-off panel.

Two reasons that is the right answer here and not a gap to patch in this session:

1. **It is exactly what a saved PDF already offers.** The pre-save and post-save looks agree, which is the property that makes the pick control's preview trustworthy — you see now what you will see later.
2. **An inline PDF viewer is one decision for both surfaces**, not a special case bolted onto the pick control. It needs its own evidence (how many real documents are PDFs rather than photographs), and it would change a shipped surface the field report did not complain about. Backlogged as its own question.

## Coverage

`FilePicker.test.tsx` — a new block for the full view: nothing opens until the card is pressed; the press opens the one viewer, named by the filename; the picked bytes reach it **with no document fetch** (the `lib/api` mock is what makes that assertable); the two object URLs are distinct, and closing revokes **only** the viewer's while the card's stays live; unmounting with the view open revokes both; clearing the file closes the view; a PDF reaches the hand-off with its own download name; the open control names both the action and the file; a disabled picker offers no full view. The existing clear test moved from `getByRole('button')` to naming `הסר` — there are two buttons in the card now, which is itself the change.

`MediaViewer.test.tsx` — a `file`-source block beside the two existing source blocks: the object URL is what the `<img>` gets and `fetchDocumentContent` is never called; the URL is revoked on unmount; the backdrop still closes and the dialog is still named; a picked PDF hands off. Placed **above** the pinch tests for the same reason G2's block is — a pinch release arms the global click swallow.

Whole frontend suite green (3025 tests), `pnpm typecheck` / `pnpm build` / `pnpm lint` green.

## Not done here, deliberately

- **No mockup.** The triage's own condition was "only if reuse of the existing viewer does not make the interaction obvious". The open/close/zoom grammar being shown is already shipped and is already the one a saved document uses; the only new pixels are the corner brackets, which are a mark, not an interaction.
- **No device pass** (ADR-0017). Whether the brackets read as "tap me" on a real phone, and whether a full-screen viewer opening from inside an open sheet feels like one layer too many, has not been seen — jsdom asserts the wiring, not the impression.
- **No inline PDF surface**, per the caveat above.
- **No change to the empty pick state, the tiles, the hint, or the upload pipeline.** ADR-0086 §1/§2/§5 and ADR-0056's outbox are untouched; this session changed only what §3 left terminal.
- **`UserPicture` unaffected** — it takes `usePickFile`'s mechanism, not `FilePicker`'s card, so it neither gains nor needs the full view.
