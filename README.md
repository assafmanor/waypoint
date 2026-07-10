# Waypoint

> **Working codename.** "Waypoint" is a placeholder for the trip control-center app — rename freely. The Hebrew product name in the mockup is **מרכז שליטה לטיול**.

A private, small-group travel companion for friends traveling abroad together. **Not a commercial product**, not built for scale — but architected so that real multi-user collaboration works from day one, and so scale _could_ be added later without a rewrite.

## The one-sentence pitch

Most travel apps are **planning** tools (build an itinerary before the flight). Waypoint is a **living visibility layer** for when you're already on the ground: it answers _"what now / what next / what do I need in the next 30 minutes?"_ for a group of ~5 friends, and makes deviating from the plan smooth and safe.

## Why this repo looks the way it does

The founding principle of this project is **document everything**. Code and documentation live together in one place. Every meaningful product, design, and technical decision is written down — including the planning sessions themselves — so that any future session (human or AI) can be brought fully up to speed from these files alone.

## Repository map

```
waypoint/
├── README.md                     ← you are here
├── .gitignore                    ← ignores secrets, build artifacts, local-only files
├── docs/
│   ├── INDEX.md                  ← master index of all documentation
│   ├── product/                  ← what we're building & why (PM layer)
│   │   ├── vision.md
│   │   ├── prd-v1.md
│   │   ├── feature-catalog.md
│   │   └── personas.md
│   ├── design/                   ← how it looks & feels
│   │   └── design-language.md
│   ├── architecture/             ← how it's built
│   │   ├── overview.md
│   │   ├── collaboration-model.md
│   │   ├── data-model.md
│   │   └── tech-stack.md
│   ├── integrations/             ← external pipes (Google, Gmail, flights…)
│   │   └── overview.md
│   ├── decisions/                ← Architecture Decision Records (ADRs)
│   │   ├── README.md
│   │   └── NNNN-title.md
│   └── planning/                 ← dated session notes & source material
│       └── YYYY-MM-DD-session-NN-*.md
└── mockups/                      ← interactive HTML mockups
    └── trip-dashboard-v2.html
```

## Status

**Phase: Product & architecture planning.** No application code yet — coding begins in a separate session once this planning is settled. See `docs/planning/` for the latest session and `docs/decisions/` for what's locked vs. open.

## Reading order for a newcomer

1. `docs/product/vision.md` — the core insight.
2. `docs/product/prd-v1.md` — what v1 actually is.
3. `docs/architecture/overview.md` — how the pieces fit.
4. `docs/decisions/README.md` — the log of _why_ things are the way they are.
