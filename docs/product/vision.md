# Vision

**Status:** ACCEPTED (carried over from the original handoff; wording polished)

## What we're building

A web/app trip control-center for **private use** — for me and my travel companions (a group of ~5). Not a commercial product.

## The central insight

Most travel apps are **planning** tools: you build an itinerary before the flight. What we want is different — **a live "visibility" layer that serves us once we're already on the ground.** Planning is the means; **"trip mode" is the point.**

## The concept: a control center in two modes

- **Planning mode** (before / between days) — input, arranging the itinerary, research.
- **Trip mode** (on the ground) — a minimal interface that answers *"what now / what next / what do I need in the next 30 minutes?"*

Both modes are equally important and share **one surface** (the same four tabs, re-emphasized). The switch is **automatic by date with a manual override**. Full model: [modes.md](modes.md) · decided in ADR-0016.

### The five pillars

1. **Live timeline (Now/Next)** — not a calendar, but *what's happening now, what's next, and how much free time sits between things.*
2. **Central index** — every booking in one place (confirmation codes, addresses, tickets). **Must work offline.**
3. **Map as a primary surface** — everything pinned; *"what's near me right now."*
4. **Hybrid recommendations** — a pre-built list + discovery by location and free time.
5. **Practical layer** — currency, language, emergency numbers, documents (passport/insurance), WiFi, budget.

**Navigation:** four tabs — 🏠 Home · 🗺️ Map · 📇 Index · 📅 Day-by-day.

## The decisive distinction: hard vs. soft events

This is the insight that reconciles the tension between **visibility** (wanting clear structure) and **flexibility** (wanting to change things on the fly):

- **Hard 🔒** — a real commitment (a flight, a restaurant with a reservation code, a timed ticket). Moving it costs something, so the app warns and never touches it on its own.
- **Soft** — intention only ("free time", "maybe a temple"). Dragged, skipped, and rescheduled freely.

Hard anchors provide the structure that "now/next" leans on; everything else flows around them. Visually: hard = badge + confirmation code; soft = dashed, lighter frame.

## Integrations — pipes, not islands

**Principle:** no integration gets its own screen. They all **feed the two existing surfaces** — "now/next" and the index. The trip is the only surface.

## Flexibility & changing plans mid-trip

**The frame:** the itinerary is a suggestion, not a contract. The app's job is to make *deviating from the plan* smooth and safe — real-travel verbs on every card (skip · delay 30m · swap · done · on our way), a "maybe" shelf, ripple suggestions, undo everywhere, and a lightweight group change-feed.

## User's technical background

Backend engineer, comfortable with React + a small service, integrations, and parsing. Technical conversation is welcome.
