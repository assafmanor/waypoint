# Handoff — reusing the trip `IconPicker` on the Trip Settings page

**For:** the agent building the trip-settings screen (`/trip/:id/settings`, ADR-0039).
**Date:** 2026-07-16
**Context:** ADR-0038 shipped a reusable icon picker; the trip variant (country flags + searchable vibe icons + destination auto-fill) is live in `CreateTrip`. This note is how to reuse it in Settings and how the icon persists.

## TL;DR — drop-in usage

```tsx
import { useState } from 'react';
import { IconPicker } from '../ui/IconPicker';
import { DESTINATIONS, TRIP_ICON_CLUSTERS } from '@waypoint/shared';
import { DEFAULT_TRIP_ICON } from '../constants';

const [icon, setIcon] = useState(trip.icon ?? DEFAULT_TRIP_ICON);

<IconPicker
  icon={icon}
  onChange={(next) => setIcon(next)} // 2nd arg is EventCategory — always undefined for trips; ignore it
  flatClusters={TRIP_ICON_CLUSTERS}
  destinations={DESTINATIONS}
/>;
```

That is the entire trip picker: **vibe clusters first, country flags last, one search box over both**, neutral ink selection. It's the same component `CreateTrip` uses — no trip-settings-specific variant needed.

## The component — `frontend/src/ui/IconPicker.tsx`

Controlled. Props:

| prop           | type                                       | notes                                                                               |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `icon`         | `string` (required)                        | the current glyph; you own the state                                                |
| `onChange`     | `(icon, category?: EventCategory) => void` | for trips the 2nd arg is always `undefined` — ignore it                             |
| `flatClusters` | `readonly (readonly string[])[]`           | pass `TRIP_ICON_CLUSTERS` — vibe glyphs, rendered spaced, no labels                 |
| `destinations` | `readonly Destination[]`                   | **presence switches the picker to TRIP MODE** (flags + search). Pass `DESTINATIONS` |
| `ariaLabel`    | `string?`                                  | optional label for the chip button                                                  |

- **Passing `destinations` is what makes it the trip picker.** Omit it and you get the _event_ picker (categorized, with a saved-category readout) — not what Settings wants.
- The chip renders inline; the panel is a dropdown anchored to it, closing on outside-click/Esc. Put the chip wherever the icon field lives (e.g. beside the trip-name input, as in `CreateTrip`).
- Selection is a **neutral ink fill** by design (ADR-0038 §6) — don't restyle it to amber/teal/violet (those are reserved).
- Search matches **both** vibe glyphs (`TRIP_VIBE_TERMS`) and country names/aliases (`DESTINATIONS`); you don't wire that — it's internal.

## Data + helpers — `@waypoint/shared`

All exported from the package root:

- `TRIP_ICON_CLUSTERS` — vibe glyphs grouped by archetype (grouping = spacing only).
- `DESTINATIONS` — curated countries `{ code, he, aliases }` (~55; append rows freely — pure data, no migration).
- `flagFromCode(code)` — ISO-3166 alpha-2 → flag emoji.
- `suggestFlagFromDestination(text)` — best-effort flag from free text (for auto-fill; see below).
- `searchDestinations(q)` / `searchVibeIcons(q)` — used internally by the picker; you won't call them for basic usage.

## Auto-suggest from destination — optional, only if Settings edits `destination`

The picker does **not** auto-suggest on its own; `CreateTrip` wires that. ADR-0039 §3 makes `destination` editable in the settings details form, so you _may_ mirror the behaviour: when the destination changes, fill the flag — but guard with an "iconTouched" flag so a manual pick isn't clobbered.

```tsx
const [iconTouched, setIconTouched] = useState(false);

const onDestinationChange = (dest: string) => {
  setDestination(dest);
  if (!iconTouched) setIcon(suggestFlagFromDestination(dest) ?? DEFAULT_TRIP_ICON);
};

// in the picker:
onChange={(next) => { setIcon(next); setIconTouched(true); }}
```

Reasonable to **skip** this in Settings: unlike creation, an existing trip already has a deliberate icon, so silently changing it when the destination is edited may surprise. Your call — manual-pick-only is perfectly fine here.

## Persisting the icon — it rides the details `PATCH`, per ADR-0039

`Trip.icon` already exists end-to-end: it's in `tripSchema` (entities), the Prisma `Trip` model, `toTripDto`, `createTripSchema`, and the trip snapshot. What's **missing is any trip-update path** — today the only trip-scoped PATCH is `PATCH /trips/:tripId/members/me` (prefs). That's exactly the work ADR-0039 assigns to Settings, and **the icon is just one field in it** — it does _not_ need its own endpoint:

1. **`packages/shared/src/schemas.ts`** — add `updateTripSchema` (partial of the editable details: `name`, `destination`, `startDate`, `endDate`, `timezone`, `currency`, `dailyBudgetMinor`, **`icon`**). One form → one partial update (ADR-0039 §3).
2. **Backend** — `PATCH /trips/:id` (admin-only, gated in the service — ADR-0039 §2) that routes through **`ChangeService.mutate()`** with `entityType: 'trip'` (ADR-0039 §5 — settings mutations are on the **data plane** now; this partially supersedes ADR-0022). Note: `createTrip` today is a plain `$transaction` (control-plane-style) — do **not** copy that for the update; the update must be on the change feed so edits are realtime + offline.
3. **Frontend** — `updateTrip(tripId, input)` in `lib/api.ts`, a new outbox verb (`update-trip`), and `trip-state.tsx`/`cache.ts` handling for `entityType: 'trip'` (today they apply only `'event'` — ADR-0039 Consequences call this out).

Once that PATCH exists, saving the icon is just including `icon` in the form's partial payload. The snapshot already carries `trip.icon`, so other clients see the new glyph on resync, and the `Change` broadcast makes it live.

## Where the icon shows up (already wired — don't rebuild)

The chosen `trip.icon` already renders on: the create "born" card, the **invite/join ticket** (`InvitePreview.icon` → `JoinTrip`), and the all-trips list falls back to `DEFAULT_TRIP_ICON`. Settings just needs to let the user _change_ it; the read surfaces are done.

## Gotchas

- **Windows doesn't render flag emoji** (shows the letter pair, e.g. "IS"). Phone-primary, so acceptable (ADR-0038 §5) — don't try to "fix" it.
- **Adding a vibe glyph** later = append to `TRIP_ICON_CLUSTERS` **and** add a row to `TRIP_VIBE_TERMS` (`icons.ts`) so search finds it. **Adding a country** = append to `DESTINATIONS`.
- `DEFAULT_TRIP_ICON` (`🧳`) is in `frontend/src/constants.ts` — use it as the fallback when `trip.icon` is null.

## References

- Component: `frontend/src/ui/IconPicker.tsx` · Data: `packages/shared/src/{icons,destinations}.ts`
- Live usage: `frontend/src/screens/CreateTrip.tsx` (chip placement + auto-suggest pattern)
- Mockups: `mockups/trip-icon-picker-v1.html` (picker + search + invite), `mockups/trip-settings-v1.html` (settings screen)
- Decisions: **ADR-0038** (icons + canonical category; §5 = trip vocabulary), **ADR-0039** (trip settings: admin-governed, data-plane `PATCH`), ADR-0005 (admin/peer), ADR-0022 (control vs data plane — partially superseded by 0039)
