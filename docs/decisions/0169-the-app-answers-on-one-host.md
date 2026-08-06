# 0169 — The app answers on one host, and the invite link reads as one

**Status:** Accepted, and **BUILT** (owner report, 2026-08-06 — three symptoms of the move to `travelive.app`)
**Date:** 2026-08-06

**Applies:** [0020](0020-auth-session-architecture.md) (the session is a host-only cookie — the fact this whole ADR turns on), [0031](0031-hosting-on-railway.md) (single-origin service), [0071](0071-fail-fast-config-validation.md) (a misconfigured deploy dies at boot, not at the first login), [0030](0030-join-is-link-only.md) / [0067](0067-revocable-code-invites-and-removal-blocks.md) (the invite is a revocable `/join/<code>` link, and the only way in)

## Context

The app moved from `wpnt-production.up.railway.app` to a bought domain, and a bought domain is **two names** — `travelive.app` and `www.travelive.app`. The owner reported three things, which look like three problems and are one:

1. Logging in lands the browser on **`wwww.travelive.app`** — four `w`s.
2. `travelive.app` (no `www`) serves the app on a laptop and GoDaddy's parked `/lander` page on a phone.
3. The invite link is a wall of `https://www.…` that nobody reads.

**Symptom 1 was one mistyped character in `FRONTEND_URL`,** and that is precisely what makes it worth an ADR. The login had already succeeded: Google called back to `GOOGLE_OAUTH_REDIRECT_URI` (spelled correctly), the state verified, the session cookie was set — and then `res.redirect(frontendUrl())` sent the browser to a hostname that does not exist. A typo in a variable nobody reads after the day it is set produced a deploy that looks completely broken, with nothing in the logs, and the app booted "healthy" and served it.

**And the reason a typo there is so cheap to make and so expensive to have** is that this app's session is a **host-only cookie**. `wp_refresh`, and the short-lived `wp_oauth` that carries the OAuth state, are set with no `Domain` attribute (ADR-0020), so any two spellings of the host are two separate logins that cannot see each other's cookies. The Google round-trip is pinned to exactly one host by `GOOGLE_OAUTH_REDIRECT_URI`, a single fixed absolute URL Google will not vary. So the two variables are not two settings — they are one host, written twice, and every way they can disagree is a different silent failure: a wrong-but-real host loses the session, a wrong-and-unreachable host loses the user, and `www` vs apex means the callback cannot verify its own state and returns the user home **signed out**.

Symptom 2 is not ours, but it is the same question: an apex `A`/`CNAME` cannot point at Railway without CNAME flattening, GoDaddy has none, so the apex was left on GoDaddy's forwarding and answers with a parked page from whichever edge a given device resolves. Which name is the app's has to be **decided once and enforced**, not spelled out by hand in four places.

## Decision

### 1. One host is canonical, and it is already named

`FRONTEND_URL` is it. No new variable: it is already the post-login redirect target in every environment (ADR-0104's staging lesson), so it is already the app's own idea of where it lives.

### 2. Every other host is sent there, by the app, before anything else

`common/canonical-host.ts`, an express middleware ahead of routing, static assets and auth. A request whose `Host` isn't the canonical one is redirected to the same **path and query** on the canonical host — an invite deep link has to survive the hop or the redirect is worse than the problem.

Three deliberate limits:

- **Production only.** In dev `FRONTEND_URL` is the _other_ origin (Vite on `:5173`, API on `:3000`); applying it locally would bounce every API call at the dev server.
- **`/health` and `/health/ready` answer on any host.** Railway's deploy gate calls them with its own `Host`; a redirect there reads as a failing healthcheck and kills the deploy. This is the one path that must not be canonicalised.
- **`GET`/`HEAD` only.** A browser turns a redirected `POST` into a `GET` and drops the body. Nothing else needs it: once the document lands on the canonical host, every request the page makes is same-origin by construction.

**302, not 301.** A canonical-host redirect is conventionally permanent, but this app is invite-only — there is no search index to please — and a 301 sits in the group's phones indefinitely. During a domain move, that is one typo away from unrecoverable-without-support. A temporary redirect costs one request per wrong-host entry and can always be taken back.

### 3. A host split refuses to boot

`validateConfig` (ADR-0071) now requires `FRONTEND_URL` in production — deployment.md always called it required, the validator never did — and refuses to start when `GOOGLE_OAUTH_REDIRECT_URI` and `FRONTEND_URL` name **different hosts**. That combination cannot log anyone in, for the cookie reason above, so booting and serving it is strictly worse than dying with the two variable names printed. This is the check that catches symptom 1: `wwww.travelive.app` is not `www.travelive.app`, so the deploy fails at boot with both names in the log instead of shipping a login that ends nowhere.

### 4. The invite link is one string, and it is the short one

`lib/invite-link.ts` turns the API's `/join/<code>` into the shortest string that still
works: `travelive.app/join/7Kq2mB`. It is what the box shows **and** what the clipboard
gets — deliberately the same string, because a label that differs from what was copied is
a small lie the reader cannot see. Both invite surfaces (`CreateTrip`'s birth screen,
`TripSettings`) go through it, replacing the `${window.location.origin}${path}` each had
grown separately.

**Only the scheme comes off** (the `www.` too, as of the amendment below). Dropping `https://`
is free here: `.app` is an HSTS-preloaded TLD, so a scheme-less link to this app cannot be
downgraded to http — the browser upgrades it before the first request — and the chat apps
an invite is actually pasted into linkify a bare host + path.

That is also why this is **not** `prettyUrl` (`lib/external-url.ts`), which also strips
tracking params and trailing slashes and which the first cut of this reused. `prettyUrl`
labels a link that has a working `href` behind it, so it is allowed to take liberties; an
invite has nothing behind it — it **is** the href, pasted into another app — so it takes
exactly the two below.

**Amended 2026-08-06, same day: the `www.` comes off too** (owner, on seeing
`www.travelive.app/join/ay9Lf9WM` in the invite box). This section originally kept it, on
the grounds that a `www.` edited out while `www` is the canonical host would be a dead link
in somebody's group chat. That was true when written and stopped being true once **both**
of these held: the apex resolves to the service (Cloudflare flattens the apex `CNAME` onto
Railway — §5), and **§2 redirects any host this service answers on to the canonical one with
the path intact**. Together those mean `travelive.app/join/<code>` arrives wherever the app
actually lives, under either canonical host — so the short form cannot strand anyone, and the
argument for keeping the `www.` had already been dissolved by §2 before anyone noticed.

The residual risk is named rather than waved off: a browser holding a **cached 301** from
when the apex was a GoDaddy parked page opens the lander regardless of what we write. It is
per-device, shrinking, and does not apply to the people invites are sent to, who have
typically never visited the domain at all.

The better fix is still §1 — set `FRONTEND_URL` to the apex and the link is short by
construction, with no string surgery at all. This strip is what makes the link read right
while the canonical host is still `www.`, and it becomes a no-op the day that changes.

### 5. Which name can be canonical is DNS's call, and it is not free

Wanting the apex is not the same as being able to have it. Railway serves a custom domain over a `CNAME`, and a `CNAME` at the apex is not a thing the DNS spec allows — providers fake it with CNAME flattening / `ALIAS` / `ANAME`, and **GoDaddy does not**. **The domain is registered at GoDaddy and its DNS is served by Cloudflare** (owner, 2026-08-06), which flattens — so the apex is available and apex-canonical is the choice this ADR assumes. Had DNS stayed on GoDaddy the only options would have been a nameserver move or a www-canonical setup with the apex on GoDaddy forwarding.

The trap in the forwarding option, and the reason it isn't simply the cheap default: GoDaddy forwarding does not reliably carry the **path**, so `travelive.app/join/<code>` forwards to the `www` home page and the invite code is gone. An apex that only ever gets typed bare is fine on forwarding; an apex people paste links to is not. Both hosts pointing at the service, with §2 doing the redirect, is what actually keeps a deep link alive.

**And forwarding leaves a mark that outlives it.** GoDaddy's parked apex answers with a **301**, which browsers cache per profile and effectively forever — so after the DNS was corrected the apex still opened the parked `/lander` in a normal window while working in incognito, which reads as a DNS or caching bug and is neither. Nothing server-side can clear it; it is why §2's redirect is a 302.

Either way the choice must be made in **four places at once** — the Railway custom domain, `FRONTEND_URL`, `GOOGLE_OAUTH_REDIRECT_URI`, and the Google Cloud console's authorized origins + redirect URIs. §3 turns three of those four disagreeing into a boot failure instead of a mystery. The runbook is in [deployment.md](../architecture/deployment.md).

## Consequences

- One login, one PWA install, one set of cookies, whichever name someone types or was sent.
- A stale `*.up.railway.app` link, or a `www.` link already shared in a group chat, keeps working — it lands on the canonical host with its path intact.
- Changing the canonical host is now a **deploy**, not just a DNS edit: `FRONTEND_URL` and `GOOGLE_OAUTH_REDIRECT_URI` must move together or the service refuses to start. That refusal is the point.
- The middleware runs on every production request. It is a string compare against one parsed URL, and it is the first thing in the chain, so a request that isn't redirected pays nothing worth measuring.

## Alternatives considered

- **Redirect at the edge (DNS/CDN) instead of in the app.** Where a canonical redirect normally belongs — but Railway has no such rule to configure, and GoDaddy forwarding is exactly the mechanism that drops the path (§5). Doing it in the app also keeps the rule next to the variable it derives from, so it cannot drift from the value the login redirect uses.
- **Set `Domain=.travelive.app` on the session cookies** so both hosts share one login. This makes the symptom go away without deciding anything: it widens the session to **every** subdomain forever (a future `staging.travelive.app` would be handed production's cookie), and it leaves two live origins — two PWA installs, two caches, two Dexie databases, and invite links that vary by whoever generated them. ADR-0020's host-only cookie is a narrower default worth keeping.
- **Have the backend return an absolute invite URL** built from `FRONTEND_URL`. It would work, and it moves a client concern to the server for no gain: the API deliberately returns a path (ADR-0067), and once §2 holds, the origin the browser is on _is_ the canonical one.
- **Leave the apex on GoDaddy forwarding and make `www` canonical.** Cheapest, no nameserver move, and genuinely fine if nobody ever pastes an apex deep link. Not chosen as the recommendation because invite links are the app's one shared URL, and this is the one option that can silently eat them.
