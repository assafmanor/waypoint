---
name: awesome-design
description: Look up how a well-known product designs something, from VoltAgent's awesome-design-md library of 74 DESIGN.md analyses (Linear, Stripe, Airbnb, Notion, Uber, Apple, Revolut, Wise, Vercel...), fetched per brand from a pinned commit. Use when the owner says "like <brand>", when a design session wants a reference for how a mature product solves a pattern (hierarchy, density, empty states, motion, dark mode), or to benchmark a Travelive surface against one. Reference, never source - no palette, font or token from it enters this repo; design-language.md and the design-mockups skill decide what Travelive looks like.
---

# awesome-design: study a reference, don't adopt it

[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT) is a
library of `DESIGN.md` files, each an analysis of one product's design system: tokens,
type scale, spacing, components, motion, do's and don'ts. It is not a skill upstream, so
this one is ours: it says where the library is and how a Travelive session may use it.

It is **fetched, not vendored** (ADR-0243): 2.9 MB across 74 brands, of which a session
needs one or two.

## Fetch one brand

```
https://raw.githubusercontent.com/VoltAgent/awesome-design-md/f6961238d5cddcf8042a74a70fc400ec67181abb/design-md/<brand>/DESIGN.md
```

Use WebFetch (or `curl -sS` in a sandbox). The commit is pinned on purpose: this text
steers a session, so it moves in a reviewed commit, together with the entry in
[`.claude/vendor/skills.json`](../../vendor/skills.json) under `fetchedAtRuntime`.

Brands, as the `<brand>` directory is spelled:

airbnb, airtable, apple, binance, bmw, bmw-m, bugatti, cal, claude, clay, clickhouse,
cohere, coinbase, composio, cursor, dell-1996, elevenlabs, expo, ferrari, figma, framer,
hashicorp, hp, ibm, intercom, kraken, lamborghini, linear.app, lovable, mastercard, meta,
minimax, mintlify, miro, mistral.ai, mongodb, nike, nintendo-2001, notion, nvidia,
ollama, opencode.ai, pinterest, playstation, posthog, raycast, renault, replicate,
resend, revolut, runwayml, sanity, sentry, shopify, slack, spacex, spotify, starbucks,
stripe, supabase, superhuman, tesla, theverge, together.ai, uber, vercel, vodafone,
voltagent, warp, webflow, wired, wise, x.ai, zapier

Closest in kind to Travelive (phone-first, on-the-go, time and place): **airbnb, uber,
revolut, wise, notion, linear.app**. Start there unless the owner named one.

## What to take, and what not to

Take **reasoning**: how a product ranks information, how dense it lets a screen get, how
it handles empty and loading states, where it spends motion, how its dark theme differs
from its light one. Say which brand and section the idea came from, so the owner can
weigh it.

Never take **values**. No hex, font, radius, shadow or spacing number from a `DESIGN.md`
goes into `frontend/` or `mockups/`. Travelive's palette, type, semantic color budget
(amber = time, teal = place, violet = plan, rose = archive) and hard/soft grammar are
decided in [`docs/design/design-language.md`](../../../docs/design/design-language.md);
a reference that disagrees is a reason to raise the question, not to change the value.

Every reference here is LTR, most are desktop-first, and none is a Hebrew product. Read
layout advice mirrored and at 360-430px before carrying the idea over.

If a reference changes how a surface should look, the change goes through the
`design-mockups` skill like any other: drawn, measured, both themes, RTL.
