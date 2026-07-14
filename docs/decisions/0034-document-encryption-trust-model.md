# 0034 — Document encryption trust model: what server-side-at-rest does and doesn't protect against

**Status:** Accepted
**Date:** 2026-07-14
**Refines:** [0015](0015-document-encryption-server-side.md) (reaffirms the decision, makes the trust boundary explicit)

## Context

T-046 built `backend/src/documents/` on ADR-0015's server-side-at-rest design: the backend holds `DOC_ENCRYPTION_KEY` and can encrypt/decrypt documents for any authorized member. Working through what that actually guarantees surfaced a question ADR-0015 didn't spell out: **if Assaf (or whoever operates the server) wanted to read a member's passport scan, could they?** The answer is yes, and it's worth stating precisely, because "server-side encryption" sounds stronger than it is if left implicit.

## Decision

Reaffirm ADR-0015 (server-side-at-rest stays the v1 approach) with the trust boundary made explicit:

- **What it protects against:** _passive_ access to data at rest — a stolen disk, a leaked storage bucket, a DB dump, someone else compromising the infrastructure. Ciphertext is genuinely opaque without `DOC_ENCRYPTION_KEY`.
- **What it does not protect against:** the operator. Whoever controls the running server code controls everything that passes through it — the key, and the plaintext during every decrypt operation. This isn't a bug to fix; it's an inherent property of _any_ scheme where decryption happens on a server you administer, even if the key is only ever held transiently and never persisted. A server that can decrypt on request for legitimate members can, by construction, decrypt for its operator too.
- Authorization (`MembershipGuard`) controls _who can ask the server to decrypt_, not whether the server itself is capable of it. Those are different guarantees, and only the first one exists today.

This is judged acceptable for v1: a private tool for ~5 friends, run by one of them, where the trust already implied by "I'm hosting this for us" is the same trust implied by "I could technically read the documents." No code change follows from this ADR — it documents the boundary so it's never assumed to be stronger than it is.

## Consequences

- Anyone extending this app to users who _don't_ already trust the operator (a broader product, not friends self-hosting for each other) must revisit this — the calculus changes materially once the operator isn't someone the data owners already extend that trust to.
- Future contributors should not describe this as "even the operator can't see your documents" — that claim is false under the current design and must not ship in product copy or docs.

## Alternatives considered

- **Full client-side (E2E) encryption now:** the browser encrypts/decrypts (WebCrypto) with a key the server never receives — genuinely removes operator access to plaintext. Rejected for this pass as the same complexity-for-marginal-benefit call ADR-0015 already made, sharpened by two concrete costs surfaced in review:
  - **Key distribution without a server:** the key has to reach every member out of band — e.g. riding in the invite link's URL fragment (never sent to the server, extending ADR-0024/0030's invite flow) or a human-shared passphrase (PBKDF2-derived). Either works; both are unbuilt.
  - **No recovery by design:** a client-held key isn't backed up anywhere on purpose. A browser cache clear, reinstall, or lost device — with no other member's copy surviving — means the documents are gone, permanently, for everyone. That's a materially different failure mode than today's (server always has the key).
- **Transient server-side key (never persisted, supplied per-request):** raises the bar against passive breaches (a DB/bucket snapshot alone reveals nothing) but does **not** close the operator gap — the operator authors the code path handling that key during the request and can capture it there regardless of persistence. Not pursued as a half-measure; it's real work for a protection this ADR already grants isn't achievable short of full E2E.
- **Threshold / multi-party key custody (Shamir's Secret Sharing across members' devices):** the only construction that removes operator access _even if the operator turns hostile and rewrites the server_, since no single party — including the operator — ever holds a reconstructable key alone. Real cryptographic engineering (key ceremonies, M-of-N recovery UX) — out of proportion for this app's scale; noted here as the actual answer if that threat model is ever real.
