# 0069 — Documents are download-only, with a server-enforced upload MIME allow-list

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Refines:** [0052](0052-document-lifecycle-view-manage-and-feedback.md) (mobile-first PDF open/download) — narrows "open" to safe types; [0015](0015-document-encryption-server-side.md) / [0034](0034-document-encryption-trust-model.md) (at-rest encryption, operator-trust) — adds the in-transit / in-browser handling those didn't cover.
**Relates:** [0020](0020-auth-session-architecture.md) (httpOnly same-origin refresh cookie — the theft target), [0065](0065-app-scope-many-trips-small-groups.md) (many users → a co-traveler is only semi-trusted).

## Context

Documents are member-uploaded files stored encrypted at rest (ADR-0015/0034) and fetched through the auth-guarded `GET /content` route. Two gaps made them a stored-XSS / account-takeover vector (backend architecture review, 2026-07-18, **B-03**, High):

1. **`/content` served bytes inline** with `Content-Type` set to the caller-declared `mimeType` and **no `Content-Disposition` and no `X-Content-Type-Options`**. There was **no upload allow-list** anywhere between the multipart body and storage.
2. The PWA viewer rendered images in `<img>` (safe) but, for every other type, built a `blob:` object URL and offered **"open in new tab"**. A `blob:` document inherits the app origin.

So a member could upload `itinerary.html` (`text/html`) or an SVG with inline script; a co-traveler opening it runs attacker JavaScript **in the Waypoint origin**, where it can `fetch('/auth/refresh')` to mint an access token and drive the whole API **as the victim, across all their trips**. ADR-0065 makes this concrete: co-travelers are only semi-trusted, and "one member takes over another's account" is a real escalation, not a theoretical one.

## Decision

Defense in depth across the three layers the bytes pass through.

1. **Server-side upload allow-list.** `ALLOWED_DOCUMENT_MIME_TYPES` (`packages/shared/constants.ts`) is the closed set documents actually are — `application/pdf` and common raster image types (jpeg, png, webp, gif, heic, heif). `DocumentsService.create()` / `update()` reject anything else with **415** _before_ encrypting or storing, so a disallowed type never reaches storage and never orphans a blob. It explicitly excludes `text/html`, `image/svg+xml`, `application/xhtml+xml` — the executable types.
2. **`/content` always downloads, never renders.** The route sends `Content-Disposition: attachment` (Unicode title via RFC 5987 `filename*`, header-injection-safe by construction, with an ASCII `filename` fallback) and `X-Content-Type-Options: nosniff`, so the browser cannot be coaxed into inline-executing the response or re-sniffing it to a more dangerous type.
3. **Viewer is download-only for non-images.** Images still preview inline in `<img>` (safe). For non-image types the viewer offers **"open in new tab" only for PDF** (`isInlineOpenableDocumentMimeType` — browsers render PDF in their built-in viewer, no origin script); every other non-image type is **download-only**. This is the belt-and-suspenders layer that also covers any legacy blob stored before the allow-list existed, since a client-built `blob:` URL's type is not governed by the response headers.

## Consequences

- The stored-XSS → refresh-cookie → access-token theft path is closed at upload (no executable type is stored), at transport (attachment + nosniff), and in the client (no inline open for executable-capable types).
- ADR-0052's "open a PDF on mobile" UX is preserved; other office/non-image types become download-only (they always downloaded in practice — Office types don't render inline anyway).
- The allow-list is intentionally tight. Adding a genuinely-needed type (e.g. an Office format) is a one-line change to `ALLOWED_DOCUMENT_MIME_TYPES` — but never add `text/html`, SVG, or XHTML.
- Regression tests: `text/html` and `image/svg+xml` uploads → 415 with no row and no blob written; `/content` carries `attachment` + `nosniff` and a Unicode-safe, injection-safe filename.

## Alternatives considered

- **Sniff/allow-list by file _content_ (magic bytes) instead of the declared MIME.** Stronger, but heavier; the declared-type allow-list plus attachment+nosniff already removes the execution path, and content-sniffing can be added later without changing the contract.
- **A restrictive `Content-Security-Policy` on the app response only.** Good defense-in-depth and still worth adding later, but it doesn't by itself stop a `blob:` document opened in a new top-level tab; download-only + the allow-list is the direct fix.
- **Keep inline "open" for all types, rely solely on server headers.** Rejected — a client-created `blob:` URL's type is set from the fetched bytes, not the `/content` headers, so headers alone don't stop an executable blob opened in a new tab.
