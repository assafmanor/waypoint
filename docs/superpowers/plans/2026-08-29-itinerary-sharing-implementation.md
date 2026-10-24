# Itinerary Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one revocable live itinerary link per trip, three server-enforced detail levels, a friendly unauthenticated mobile reader, and a compact downloadable A4 PDF without exposing operational data to future narrative models.

**Architecture:** A `TripShare` capability row owns one 8-character base58 code and one current projection policy per trip. A new backend sharing module builds an explicit allowlisted projection for both the public React reader and a separate Chromium-backed PDF renderer; a narrow, versioned narrative port can enrich only Summary-public text and falls back deterministically without blocking either output.

**Tech Stack:** TypeScript monorepo, `@waypoint/shared` + zod, NestJS, Prisma/Postgres, React 19 + Vite PWA, Vitest, Playwright/Chromium, Railway single-container deployment.

**Spec:** [`docs/decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md`](../../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)

## Global Constraints

- V1 has exactly one `TripShare` row per trip. Updating its projection changes the existing live link; rotating its code invalidates the old URL immediately.
- Creating, changing, rotating, or revoking a share is admin-only. Every current trip member may open the owner sheet and share an existing link or request its PDF.
- A newly created share defaults to `full`; every Everything field family is off.
- Every public read queries the current trip rows; no itinerary snapshot is persisted on `TripShare`. PDF is a point-in-time rendering generated from that same live projection.
- Everything has four independently selected families: booking secrets, notes/tasks, traveler identity without email, and individually selected documents. Financial data stays excluded in v1 because no approved sharing control exposes it.
- The public projection contains no trip, event, booking, place, member, note, task, or document database identifiers except a selected document handle used only in its bearer download URL.
- Summary excludes exact times, addresses, map links, travel legs, and every Everything family. Full adds orientation facts but never Everything fields.
- Dayparts derive from each event's displayed local start time: morning 05:00-11:59, noon 12:00-13:59, afternoon 14:00-17:59, evening 18:00-21:59, night 22:00-04:59, flexible when no start exists. Empty groups do not render.
- Public JSON, HTML navigations, PDFs, and selected-document downloads send `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow, noarchive`.
- Public share responses are never written to Dexie, Cache Storage, or the service-worker precache. An already-open page remains readable from React memory while offline; a reload requires the network.
- `SummaryNarrativeInput` is built independently from the selected share level. Full/Everything settings can never widen it.
- No external model ships in this build. `ItineraryNarrativeGenerator` is a named injection port with a disabled implementation; deterministic narrative is always complete and production-safe.
- Public reads and PDF requests never wait for model generation. A current validated cached result may replace fallback strings; all other states use fallback immediately.
- Hebrew product copy lives in `frontend/src/i18n/he.ts`; no user-facing em dash; `ltrIsolate` wraps Latin/numeric runs inside Hebrew prose.
- All overlays reuse `Modal`/`Sheet`; all owner writes go directly to the server and are online-only. Public sharing configuration is not an outbox entity.
- The fixed-light PDF is a separate A4 renderer, not a screenshot or print stylesheet over the public React component.
- Do not commit generated PDFs, render screenshots, `tmp/`, `.agents/`, `.superpowers/`, or local environment files.

## File and Interface Map

### Shared package

- Create `packages/shared/src/sharing.ts`: detail constants, request/response types, strict zod schemas, daypart derivation, and narrative input/output contracts.
- Create `packages/shared/src/sharing.test.ts`: schema strictness, detail-level matrix, and timezone/daypart boundary tests.
- Modify `packages/shared/src/index.ts`: export the sharing contract.

### Backend

- Modify `backend/prisma/schema.prisma` and create `backend/prisma/migrations/20260829190000_itinerary_sharing_adr0213/migration.sql`.
- Create `backend/src/sharing/`: module, authenticated management controller, public controller, projection service, narrative service/port, PDF browser service/template, response-header helper, and focused specs.
- Modify `backend/src/app.module.ts`, `backend/src/trips/invite.util.ts`, `backend/src/trips/trips.service.ts`, `backend/src/common/trip-scope.util.ts`, `Dockerfile`, and backend package metadata.

### Frontend

- Create `frontend/src/screens/SharedItinerary.tsx`, `SharedItinerary.test.tsx`, and `shared-itinerary.css`.
- Create `frontend/src/ui/ShareItinerarySheet.tsx` and its test.
- Create `frontend/src/lib/share-itinerary.ts`, `share-itinerary.test.ts`, `system-share.ts`, and `system-share.test.ts`.
- Modify `frontend/src/App.tsx`, `frontend/src/App.authgate.test.tsx`, `frontend/src/screens/AllTrips.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/invite-link.ts`, `frontend/src/i18n/he.ts`, and stylesheet imports.
- Create `frontend/src/screens/AllTrips.test.tsx`.
- Create `frontend/e2e/shared-itinerary.spec.ts`.

### Documentation

- Modify `docs/architecture/api-contract.md`, `docs/architecture/data-model.md`, `docs/architecture/deployment.md`, `.env.example`, `docs/engineering/prerequisites-checklist.md`, ADR-0213, its planning note, mockup catalog, and backlog.

---

### Task 1: Shared sharing contract and daypart derivation

**Files:**

- Create: `packages/shared/src/sharing.ts`
- Test: `packages/shared/src/sharing.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces `SHARE_DETAIL_LEVEL`, `SHARE_DAYPART`, `ShareDetailLevel`, `ShareDaypart`, `ShareSensitiveFields`, `TripShareConfig`, `SharedItinerary`, `SummaryNarrativeInput`, and `ItineraryNarrativeOutput`.
- Produces `shareDaypart(startsAt: string | null, displayTimezone: string): ShareDaypart`.
- Produces strict schemas `upsertTripShareSchema`, `tripShareConfigSchema`, `sharedItinerarySchema`, `summaryNarrativeInputSchema`, and `itineraryNarrativeOutputSchema`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  SHARE_DAYPART,
  shareDaypart,
  summaryNarrativeInputSchema,
  upsertTripShareSchema,
} from './sharing';

describe('shareDaypart', () => {
  it.each([
    ['2026-09-01T04:59:00Z', 'UTC', SHARE_DAYPART.NIGHT],
    ['2026-09-01T05:00:00Z', 'UTC', SHARE_DAYPART.MORNING],
    ['2026-09-01T12:00:00Z', 'UTC', SHARE_DAYPART.NOON],
    ['2026-09-01T14:00:00Z', 'UTC', SHARE_DAYPART.AFTERNOON],
    ['2026-09-01T18:00:00Z', 'UTC', SHARE_DAYPART.EVENING],
    ['2026-09-01T22:00:00Z', 'UTC', SHARE_DAYPART.NIGHT],
    [null, 'Asia/Tokyo', SHARE_DAYPART.FLEXIBLE],
  ])('groups %s in %s', (startsAt, zone, expected) => {
    expect(shareDaypart(startsAt, zone)).toBe(expected);
  });
});

it('keeps Everything fields off unless the level is Everything', () => {
  expect(() =>
    upsertTripShareSchema.parse({
      detailLevel: 'full',
      sensitive: { bookingSecrets: true, notesAndTasks: false, travelerIdentity: false },
      documentIds: [],
    }),
  ).toThrow();
});

it('rejects unknown narrative input fields', () => {
  expect(() =>
    summaryNarrativeInputSchema.parse({ locale: 'he', days: [], travelerNames: ['Dana'] }),
  ).toThrow();
});
```

- [ ] **Step 2: Run the test and confirm red**

Run: `pnpm --filter @waypoint/shared exec vitest run src/sharing.test.ts`

Expected: FAIL because `./sharing` does not exist.

- [ ] **Step 3: Add the constants, strict schemas, and pure timezone derivation**

Use named objects, not loose literals:

```ts
export const SHARE_DETAIL_LEVEL = {
  SUMMARY: 'summary',
  FULL: 'full',
  EVERYTHING: 'everything',
} as const;

export const SHARE_DAYPART = {
  MORNING: 'morning',
  NOON: 'noon',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night',
  FLEXIBLE: 'flexible',
} as const;

export function shareDaypart(startsAt: string | null, displayTimezone: string): ShareDaypart {
  if (!startsAt) return SHARE_DAYPART.FLEXIBLE;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: displayTimezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(startsAt)),
  );
  if (hour >= 5 && hour < 12) return SHARE_DAYPART.MORNING;
  if (hour < 14) return SHARE_DAYPART.NOON;
  if (hour < 18) return SHARE_DAYPART.AFTERNOON;
  if (hour < 22) return SHARE_DAYPART.EVENING;
  return SHARE_DAYPART.NIGHT;
}
```

Define public projection schemas with `.strict()` at every object boundary. `SharedItinerary` days contain already-grouped sections so neither the web reader nor PDF renderer can invent a second grouping rule.

- [ ] **Step 4: Run shared verification**

Run: `pnpm --filter @waypoint/shared exec vitest run src/sharing.test.ts && pnpm --filter @waypoint/shared build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sharing.ts packages/shared/src/sharing.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): define itinerary sharing contracts"
```

---

### Task 2: Durable share capability and reusable authorization/code helpers

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829190000_itinerary_sharing_adr0213/migration.sql`
- Modify: `backend/src/common/trip-scope.util.ts`
- Test: `backend/src/common/trip-scope.util.spec.ts`
- Create: `backend/src/common/public-code.util.ts`
- Test: `backend/src/common/public-code.util.spec.ts`
- Modify: `backend/src/trips/invite.util.ts`
- Modify: `backend/src/trips/trips.service.ts`

**Interfaces:**

- Produces Prisma models `TripShare`, `TripShareDocument`, and `ItineraryNarrative` plus enum `ShareDetailLevel`.
- Produces `assertTripAdmin(prisma, tripId, userId): Promise<void>` and `generatePublicCode(length?: number): string`.
- Preserves `generateInviteCode(): string` as a compatibility wrapper returning `generatePublicCode(8)`.

- [ ] **Step 1: Add failing helper tests**

```ts
it('generates an 8-character base58 public capability', () => {
  expect(generatePublicCode()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{8}$/);
});

it('rejects a peer when admin authority is required', async () => {
  await expect(assertTripAdmin(prisma, SEEDED_TRIP, PEER_USER)).rejects.toThrow(ForbiddenException);
});
```

- [ ] **Step 2: Run the focused tests and confirm red**

Run: `pnpm --filter @waypoint/backend exec vitest run src/common/public-code.util.spec.ts src/common/trip-scope.util.spec.ts`

Expected: FAIL because both exports are missing.

- [ ] **Step 3: Add the migration and Prisma relations**

The Prisma shape is:

```prisma
enum ShareDetailLevel {
  summary
  full
  everything
}

model TripShare {
  id                      String           @id @default(cuid())
  tripId                  String           @unique
  code                    String           @unique
  detailLevel             ShareDetailLevel @default(full)
  includeBookingSecrets   Boolean          @default(false)
  includeNotesAndTasks    Boolean          @default(false)
  includeTravelerIdentity Boolean          @default(false)
  createdBy               String
  createdAt               DateTime         @default(now())
  updatedAt               DateTime         @updatedAt
  revokedAt               DateTime?
  trip                    Trip             @relation(fields: [tripId], references: [id], onDelete: Cascade)
  documents               TripShareDocument[]
  narratives              ItineraryNarrative[]
}

model TripShareDocument {
  shareId    String
  documentId String
  share      TripShare @relation(fields: [shareId], references: [id], onDelete: Cascade)
  document   Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@id([shareId, documentId])
  @@index([documentId])
}

model ItineraryNarrative {
  id           String   @id @default(cuid())
  shareId      String
  locale       String
  inputHash    String
  skillVersion String
  provider     String
  model        String
  output       Json
  generatedAt  DateTime @default(now())
  share        TripShare @relation(fields: [shareId], references: [id], onDelete: Cascade)
  @@unique([shareId, locale, inputHash, skillVersion])
}
```

Add inverse relations on `Trip` and `Document`. The SQL migration creates the enum, tables, unique indexes, document index, and cascading foreign keys exactly matching this schema.

- [ ] **Step 4: Implement helpers and replace the invite-local duplicate**

`assertTripAdmin` queries the composite membership key and throws `ForbiddenException` unless `role === MEMBERSHIP_ROLE.ADMIN`. Update existing `TripsService.assertAdmin` call sites to delegate to it; do not change behavior. `invite.util.ts` keeps its export while delegating code generation to the common utility.

- [ ] **Step 5: Generate Prisma and run migration/helper coverage**

Run: `pnpm --filter @waypoint/backend prisma:generate && pnpm --filter @waypoint/backend exec prisma migrate deploy && pnpm --filter @waypoint/backend exec vitest run src/common/public-code.util.spec.ts src/common/trip-scope.util.spec.ts src/trips/trips.service.spec.ts`

Expected: PASS, including existing invite stability/rotation tests.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/common backend/src/trips/invite.util.ts backend/src/trips/trips.service.ts
git commit -m "feat(sharing): persist one revocable trip share"
```

---

### Task 3: Explicit server-owned sharing projection

**Files:**

- Create: `backend/src/sharing/sharing-projection.service.ts`
- Create: `backend/src/sharing/sharing-projection.service.spec.ts`
- Create: `backend/src/sharing/sharing.select.ts`

**Interfaces:**

- Consumes `TripShare` policy and `shareDaypart` from `@waypoint/shared`.
- Produces `SharingProjectionService.byCode(code, locale): Promise<SharedItinerary>` and `byTrip(tripId, locale): Promise<SharedItinerary>`.
- Produces `SUMMARY_SELECT`, an explicit Prisma `select` that omits emails, coordinates, provider payloads, confirmation codes, notes/tasks/documents, and member identity.

- [ ] **Step 1: Write red privacy/projection tests**

```ts
it.each(['summary', 'full', 'everything'] as const)(
  'never leaks identifiers or email in %s',
  async (detailLevel) => {
    const projection = await seededProjection({ detailLevel });
    const json = JSON.stringify(projection);
    expect(json).not.toContain('u-assaf');
    expect(json).not.toContain('@example.com');
    expect(json).not.toContain('trip-japan-26');
    expect(json).not.toContain('googlePlaceId');
  },
);

it('keeps Summary identity while removing exact orientation facts', async () => {
  const projection = await seededProjection({ detailLevel: 'summary' });
  expect(projection.days.flatMap((d) => d.sections).flatMap((s) => s.events)[0]).toEqual(
    expect.objectContaining({ title: expect.any(String), startsAtLabel: undefined }),
  );
});

it('includes only enabled Everything families', async () => {
  const projection = await seededProjection({
    detailLevel: 'everything',
    includeBookingSecrets: true,
    includeNotesAndTasks: false,
  });
  expect(projection.appendix?.bookingSecrets.length).toBeGreaterThan(0);
  expect(projection.appendix?.notesAndTasks).toBeUndefined();
});
```

- [ ] **Step 2: Run the projection spec and confirm red**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/sharing-projection.service.spec.ts`

Expected: FAIL because the sharing module does not exist.

- [ ] **Step 3: Implement explicit selects and pure mapping**

Query the share row first. Reject missing/revoked codes with `NotFoundException`. Query each detail family only when its policy permits it; do not load a full `TripSnapshot` and delete fields afterward.

The mapper must construct this shape directly:

```ts
return sharedItinerarySchema.parse({
  status: 'live',
  detailLevel: share.detailLevel,
  generatedAt: now.toISOString(),
  trip: { name: trip.name, destination: trip.destination, startDate, endDate, routeLabels },
  narrative,
  days: groupDays(events.map(toPublicEvent)),
  appendix: share.detailLevel === 'everything' ? selectedAppendix : undefined,
});
```

Resolve each event's display zone with the same priority currently used by event presentation: explicit event display zone, then place zone, then trip zone. Call `shareDaypart` once and omit empty groups. Full map URLs use public display names/addresses; do not return raw coordinates.

- [ ] **Step 4: Run projection tests**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/sharing-projection.service.spec.ts`

Expected: PASS for all three levels, empty dayparts, multi-zone boundaries, and disabled-field omissions.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sharing/sharing-projection.service.ts backend/src/sharing/sharing-projection.service.spec.ts backend/src/sharing/sharing.select.ts
git commit -m "feat(sharing): build privacy-scoped itinerary projections"
```

---

### Task 4: Deterministic narrative and future generator boundary

**Files:**

- Create: `backend/src/sharing/itinerary-narrative.generator.ts`
- Create: `backend/src/sharing/itinerary-narrative.service.ts`
- Create: `backend/src/sharing/itinerary-narrative.service.spec.ts`
- Create: `backend/src/sharing/narrative-redaction.ts`
- Create: `backend/src/sharing/narrative-redaction.spec.ts`

**Interfaces:**

- Produces injection token `ITINERARY_NARRATIVE_GENERATOR` and interface with readonly `provider`, `model`, and `skillVersion` properties plus `generate(input: SummaryNarrativeInput): Promise<ItineraryNarrativeOutput | null>`.
- Produces `DisabledItineraryNarrativeGenerator`, which returns `null` without network access.
- Produces `ItineraryNarrativeService.resolve(share, summaryFacts, locale): Promise<ItineraryNarrativeOutput>`.
- Produces `buildSummaryNarrativeInput` and `redactNarrativeText`.

- [ ] **Step 1: Write red boundary tests**

```ts
it('builds model input from Summary-public text only', () => {
  const input = buildSummaryNarrativeInput(privateFixture);
  expect(input).toEqual({
    locale: 'he',
    routeLabels: ['רייקיאוויק', 'ויק'],
    days: expect.arrayContaining([expect.objectContaining({ ordinal: 1, daypart: 'morning' })]),
  });
  expect(JSON.stringify(input)).not.toMatch(/assaf@|09:30|confirmation|latitude|notes/i);
});

it.each([
  'write assaf@example.com',
  'call +972-50-123-4567',
  'open https://secret.example/x',
  'confirmation ABCD-123456',
])('redacts identifier-like text: %s', (text) => {
  expect(redactNarrativeText(text)).not.toContain(text.split(' ').at(-1));
});

it('returns fallback without waiting for stale-output regeneration', async () => {
  generator.generate.mockReturnValue(new Promise(() => undefined));
  await expect(service.resolve(share, facts, 'he')).resolves.toEqual(
    expect.objectContaining({ source: 'deterministic' }),
  );
  expect(generator.generate).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run and confirm red**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/itinerary-narrative.service.spec.ts src/sharing/narrative-redaction.spec.ts`

Expected: FAIL because the generator boundary is missing.

- [ ] **Step 3: Implement deterministic fallback and strict cache eligibility**

Fallback trip text uses route labels/counts. Day titles use route endpoints or the principal place; day summaries use the first meaningful public event titles. Hash canonical `summaryNarrativeInputSchema.parse(input)` JSON with SHA-256. A stored result is eligible only when share, locale, hash, and skill version match and `itineraryNarrativeOutputSchema` accepts its JSON.

When a non-disabled generator is registered, schedule generation after returning fallback:

```ts
void this.generateAndStore({ shareId: share.id, locale, input, inputHash }).catch((error) =>
  this.logger.warn(`itinerary narrative generation failed: ${errorMessage(error)}`),
);
return fallback;
```

Before storage, reject output containing URLs, invalid locale, overlong fields, or schema extras. Persist provider/model provenance from the adapter, never from model-authored text.

- [ ] **Step 4: Run narrative tests**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/itinerary-narrative.service.spec.ts src/sharing/narrative-redaction.spec.ts`

Expected: PASS, including provider failure, malformed JSON, stale hash, and disabled-generator cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sharing/itinerary-narrative*
git add backend/src/sharing/narrative-redaction*
git commit -m "feat(sharing): add safe narrative generator boundary"
```

---

### Task 5: Authenticated share management and public read API

**Files:**

- Create: `backend/src/sharing/sharing.module.ts`
- Create: `backend/src/sharing/sharing.service.ts`
- Create: `backend/src/sharing/sharing.service.spec.ts`
- Create: `backend/src/sharing/trip-sharing.controller.ts`
- Create: `backend/src/sharing/public-sharing.controller.ts`
- Create: `backend/src/sharing/public-response-headers.ts`
- Test: `backend/src/sharing/sharing.controller.spec.ts`
- Modify: `backend/src/documents/documents.module.ts`
- Modify: `backend/src/common/all-exceptions.filter.ts`
- Test: `backend/src/common/all-exceptions.filter.spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/openapi-contract.spec.ts`

**Interfaces:**

- Authenticated: `GET /trips/:tripId/share`, `PUT /trips/:tripId/share`, `POST /trips/:tripId/share/rotate`, `DELETE /trips/:tripId/share`.
- Public: `GET /shared-itineraries/:code` and `GET /shared-itineraries/:code/documents/:documentId`.
- `PUT` is idempotent. It creates a missing/revoked row with a fresh code, replaces selected document rows transactionally, and returns `TripShareConfig` with root-relative `shareUrl: /s/<code>`, matching the invite API's origin-agnostic technique.

- [ ] **Step 1: Write red service/controller tests**

```ts
it('creates one stable Full share with every sensitive flag off', async () => {
  const first = await service.upsert(tripId, adminId, fullInput);
  const second = await service.upsert(tripId, adminId, fullInput);
  expect(first.code).toMatch(/^[1-9A-HJ-NP-Za-km-z]{8}$/);
  expect(second.code).toBe(first.code);
  expect(second.sensitive).toEqual({
    bookingSecrets: false,
    notesAndTasks: false,
    travelerIdentity: false,
  });
});

it('lets a peer read an existing config but not mutate it', async () => {
  await expect(service.get(tripId, peerId)).resolves.toEqual(expect.any(Object));
  await expect(service.upsert(tripId, peerId, fullInput)).rejects.toThrow(ForbiddenException);
});

it('makes a rotated or revoked public code return 404', async () => {
  const old = await service.upsert(tripId, adminId, fullInput);
  await service.rotate(tripId, adminId);
  await expect(projection.byCode(old.code, 'he')).rejects.toThrow(NotFoundException);
});

it('downloads only a document selected for this active share', async () => {
  await expect(service.publicDocument(code, selectedDocumentId)).resolves.toEqual(
    expect.objectContaining({ mimeType: 'application/pdf' }),
  );
  await expect(service.publicDocument(code, otherDocumentId)).rejects.toThrow(NotFoundException);
});
```

- [ ] **Step 2: Run and confirm red**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/sharing.service.spec.ts src/sharing/sharing.controller.spec.ts`

Expected: FAIL because no sharing controllers are registered.

- [ ] **Step 3: Implement management service and controllers**

Use `MembershipGuard` on every trip route and `assertTripAdmin` inside every mutation. Validate body with `ZodValidationPipe(upsertTripShareSchema)`. `GET` returns 404 when no active share exists; it never creates on a read.

Mark the public controller `@Public()` and apply the invite-equivalent `@Throttle({ default: { limit: 20, ttl: 60_000 } })`. Set public privacy headers through one helper before returning the strict `SharedItineraryDto`.

Export `DocumentsService` from `DocumentsModule`, import that module into sharing, and reuse `getContent(tripId, documentId)` only after a single query proves `(active share code, selected documentId)` belongs to the same row. The selected-document endpoint always uses attachment disposition, `nosniff`, and the public no-store headers.

Update `SpaFallbackFilter` so direct `/s/<code>` navigations receive the same no-store/referrer/robots headers when it serves `index.html`; other app routes keep their current revalidation policy. The precached app shell contains no itinerary data and remains eligible for the existing navigation fallback.

- [ ] **Step 4: Run API and OpenAPI tests**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing src/openapi-contract.spec.ts`

Expected: PASS with all five routes present and zod response serialization active on JSON routes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sharing backend/src/app.module.ts backend/src/openapi-contract.spec.ts
git add backend/src/documents/documents.module.ts backend/src/common/all-exceptions.filter*
git commit -m "feat(sharing): expose managed and public itinerary APIs"
```

---

### Task 6: Public mobile itinerary reader

**Files:**

- Create: `frontend/src/screens/SharedItinerary.tsx`
- Test: `frontend/src/screens/SharedItinerary.test.tsx`
- Create: `frontend/src/screens/shared-itinerary.css`
- Create: `frontend/src/lib/share-itinerary.ts`
- Test: `frontend/src/lib/share-itinerary.test.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.authgate.test.tsx`
- Modify: `frontend/src/i18n/he.ts`
- Modify: the stylesheet import manifest used by `frontend/src/App.tsx`

**Interfaces:**

- Produces unauthenticated route `/s/:code` and `fetchSharedItinerary(code, signal)` using plain `fetch`, never auth-refreshing `apiFetch`.
- Produces `SharedItinerary` rendering with stable trip header, route strip, expandable days, and non-empty daypart sections.

- [ ] **Step 1: Write red auth-gate and reader tests**

```tsx
it('allows an anonymous /s route through AuthGate', async () => {
  renderGate('/s/7Kq2mB9x', 'anonymous');
  expect(await screen.findByText('SHARE_OUTLET')).toBeInTheDocument();
  expect(screen.queryByText('LOGIN_SCREEN')).not.toBeInTheDocument();
});

it('renders Summary event identity without exact facts', async () => {
  server.use(sharedItineraryFixture('summary'));
  renderShared('/s/7Kq2mB9x');
  expect(await screen.findByText('הפארק הלאומי ת׳ינגווליר')).toBeInTheDocument();
  expect(screen.queryByText('09:30')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: t.share.public.map })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm red**

Run: `pnpm --filter @waypoint/frontend exec vitest run src/App.authgate.test.tsx src/screens/SharedItinerary.test.tsx src/lib/share-itinerary.test.ts`

Expected: FAIL because `/s/` is not public and the reader is missing.

- [ ] **Step 3: Add the public route and data states**

Generalize the gate predicate:

```ts
export const publicAppPath = (pathname: string) =>
  pathname === '/login' || pathname.startsWith('/join/') || pathname.startsWith('/s/');
```

Add `<Route path="s/:code" element={<SharedItinerary />} />` inside the gate. The screen owns loading, unavailable, and in-memory connection-loss states. A failed initial request renders unavailable; a failed refresh keeps the last in-memory projection and labels it stale without writing it to persistent storage.

- [ ] **Step 4: Build the approved visual hierarchy**

Port only the proposal block and layout decisions from `a-shared-itinerary-is-organized-by-the-day-v3.html`; use `Icon` paths/components, shared tokens, `Collapsible`, `ltrIsolate`, and real response data. Warmth comes from the actual route strip, event badges, and daypart headings; add no cover upload, stock/generated image, or static-map dependency. Do not port mockup-review chrome, hardcoded Iceland fixtures, generated CSS, or the placeholder QR.

All visible controls meet 44px. Both themes render, but the public trip header remains its designed dark trip identity. `prefers-reduced-motion` removes section transitions.

- [ ] **Step 5: Run focused frontend verification**

Run: `pnpm --filter @waypoint/frontend exec vitest run src/App.authgate.test.tsx src/screens/SharedItinerary.test.tsx src/lib/share-itinerary.test.ts && pnpm --filter @waypoint/frontend typecheck`

Expected: PASS for Summary, Full, Everything appendix, revoked, stale-in-memory, dark theme, and day expansion.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.authgate.test.tsx frontend/src/i18n/he.ts
git add frontend/src/lib/api.ts frontend/src/lib/share-itinerary*
git add frontend/src/screens/SharedItinerary* frontend/src/screens/shared-itinerary.css
git commit -m "feat(sharing): add the public itinerary reader"
```

---

### Task 7: Two-entry owner sharing flow and system share fallback

**Files:**

- Create: `frontend/src/ui/ShareItinerarySheet.tsx`
- Test: `frontend/src/ui/ShareItinerarySheet.test.tsx`
- Create: `frontend/src/lib/system-share.ts`
- Test: `frontend/src/lib/system-share.test.ts`
- Modify: `frontend/src/lib/invite-link.ts`
- Test: `frontend/src/lib/invite-link.test.ts`
- Modify: `frontend/src/screens/AllTrips.tsx`
- Create: `frontend/src/screens/AllTrips.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/i18n/he.ts`
- Modify: `frontend/src/screens.css`

**Interfaces:**

- Produces `ShareItinerarySheet({ tripId, isAdmin, onClose })` through the existing `Modal`/`Sheet` stack.
- Produces `shareUrlOrCopy({ title, text, url }): Promise<'shared' | 'copied' | 'cancelled'>` and `shareFileOrDownload(file): Promise<'shared' | 'downloaded' | 'cancelled'>`.
- Generalizes `inviteLink(path)` into `publicAppLink(path)` while preserving `inviteLink` as a wrapper; both `/join/<code>` and `/s/<code>` therefore use the same current-origin, scheme-less, no-`www` technique.
- Adds Share entry to the in-trip header and every All Trips card.

- [ ] **Step 1: Write red sheet/helper tests**

```ts
it('falls back to clipboard when native sharing is unavailable', async () => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  await expect(shareUrlOrCopy({ title: 'Iceland', text: 'Trip', url })).resolves.toBe('copied');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
});

it('treats native-share cancellation as a quiet cancellation', async () => {
  navigator.share = vi.fn().mockRejectedValueOnce(new DOMException('cancel', 'AbortError'));
  await expect(shareUrlOrCopy({ title: 'Iceland', text: 'Trip', url })).resolves.toBe('cancelled');
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

it('keeps the ordinary path to preset then system share', async () => {
  renderSheet({ isAdmin: true });
  await user.click(screen.getByRole('radio', { name: t.share.level.full.title }));
  await user.click(screen.getByRole('button', { name: t.share.actions.liveLink }));
  expect(upsertTripShare).toHaveBeenCalledWith(tripId, fullConfig);
  expect(shareUrlOrCopy).toHaveBeenCalledTimes(1);
});

it('confirms rotation and replaces the copied URL', async () => {
  renderSheet({ isAdmin: true, existing: activeShare });
  await user.click(screen.getByRole('button', { name: t.share.manage.rotate }));
  await user.click(screen.getByRole('button', { name: t.share.manage.rotateConfirm }));
  expect(rotateTripShare).toHaveBeenCalledWith(tripId);
  expect(await screen.findByText('travelive.app/s/New8Code')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm red**

Run: `pnpm --filter @waypoint/frontend exec vitest run src/ui/ShareItinerarySheet.test.tsx src/lib/system-share.test.ts`

Expected: FAIL because the sheet/helper do not exist.

- [ ] **Step 3: Implement the short path and admin boundary**

The sheet loads existing config. If none exists and the viewer is admin, Full is selected and the first Live Link/PDF action performs the idempotent `PUT`; do not require a separate Save. A peer can share/download an existing link but sees a quiet admin-only explanation instead of configuration controls. When an admin opens Everything from All Trips, lazily call the existing authenticated `fetchSnapshot(tripId)` only then to populate document choices; Summary/Full never fetch the snapshot.

An admin-only secondary disclosure contains Rotate Link and Stop Sharing. Rotate requires `ConfirmDialog`, updates the displayed/copied URL, and makes the old code unavailable. Stop Sharing also requires confirmation, calls `DELETE`, and returns the sheet to the not-shared state without deleting the configuration row.

Summary, Full, and Everything are one `ChoiceGrid`. Only Everything reveals the four private rows; document selection uses current trip documents and stays off until explicitly selected. Changing preset or switches updates local draft and persists on the next outcome press.

Cancellation of the native share sheet is not an error toast. Unsupported native sharing copies the link or downloads the PDF Blob through a temporary object URL that is always revoked.

- [ ] **Step 4: Add both entry points**

In `Header`, add the 44px Share action beside existing trip actions. In `AllTrips`, add a Share button to every card and stop propagation so it never opens the trip. Both set the same top-level `shareTripId`; render one `ShareItinerarySheet` owner rather than two sheet implementations.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @waypoint/frontend exec vitest run src/ui/ShareItinerarySheet.test.tsx src/lib/system-share.test.ts src/Header.test.tsx src/screens/AllTrips.test.tsx`

Expected: PASS for both entries, admin/peer behavior, native-share cancellation, clipboard fallback, and Everything disclosure.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/ShareItinerarySheet* frontend/src/lib/system-share*
git add frontend/src/screens/AllTrips.tsx frontend/src/screens/AllTrips.test.tsx frontend/src/App.tsx
git add frontend/src/lib/api.ts frontend/src/lib/invite-link* frontend/src/i18n/he.ts frontend/src/screens.css
git commit -m "feat(sharing): add two-tap itinerary sharing flow"
```

---

### Task 8: Dedicated fixed-light A4 PDF endpoint

**Files:**

- Create: `backend/src/sharing/pdf-browser.service.ts`
- Test: `backend/src/sharing/pdf-browser.service.spec.ts`
- Create: `backend/src/sharing/itinerary-pdf.template.ts`
- Test: `backend/src/sharing/itinerary-pdf.template.spec.ts`
- Modify: `backend/src/sharing/public-sharing.controller.ts`
- Modify: `backend/src/sharing/sharing.module.ts`
- Create: `backend/src/sharing/pdf-container-smoke.ts`
- Modify: `backend/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/verify-pdf-smoke.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`
- Modify: `.env.example`

**Interfaces:**

- Adds public `GET /shared-itineraries/:code/pdf` returning `application/pdf` and an RFC 5987 attachment filename.
- Produces singleton `PdfBrowserService.render(projection: SharedItinerary): Promise<Buffer>`.
- Adds `PDF_CHROMIUM_PATH` default `/usr/bin/chromium`, `PDF_RENDER_TIMEOUT_MS` default `15_000`, and `PDF_RENDER_CONCURRENCY` default `2`.

- [ ] **Step 1: Write red template/browser/controller tests**

```ts
it('renders Full into break-safe A4 day cards without public-page controls', () => {
  const html = itineraryPdfHtml(fullProjection);
  expect(html).toContain('@page { size: A4;');
  expect(html).toContain('break-inside: avoid');
  expect(html).not.toContain('accordion');
  expect(html).not.toContain('data-theme');
});

it('sets PDF privacy and attachment headers', async () => {
  await controller.pdf('7Kq2mB9x', response);
  expect(response.headers['Content-Type']).toBe('application/pdf');
  expect(response.headers['Cache-Control']).toBe('private, no-store');
  expect(response.headers['Content-Disposition']).toContain("filename*=UTF-8''");
});
```

- [ ] **Step 2: Run and confirm red**

Run: `pnpm --filter @waypoint/backend exec vitest run src/sharing/itinerary-pdf.template.spec.ts src/sharing/pdf-browser.service.spec.ts src/sharing/sharing.controller.spec.ts`

Expected: FAIL because no PDF renderer or route exists.

- [ ] **Step 3: Implement a bounded shared Chromium process**

Add `playwright-core` and `qrcode` as backend production dependencies without downloading a bundled browser. Add `pdfjs-dist` as a root dev dependency for artifact verification. `PdfBrowserService` lazily launches one system Chromium, creates one isolated page per request, permits at most two active pages, rejects queued work after 15 seconds with `503` plus `Retry-After: 5`, closes each page in `finally`, and closes the browser in `onModuleDestroy`. Override the PDF route to 5 requests per IP per minute; JSON and selected-document reads retain the 20/min public cap.

```ts
const browser = await chromium.launch({
  executablePath: pdfChromiumPath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
await page.setContent(itineraryPdfHtml(projection), { waitUntil: 'load' });
return Buffer.from(
  await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
);
```

Do not allow template content to introduce remote requests: escape every projected string, inline the approved print CSS, load the existing `frontend/src/assets/fonts/assistant-{hebrew,latin}.woff2` bytes into data-URL `@font-face` rules, and use `page.route('**/*', route => route.abort())` before `setContent`.

- [ ] **Step 4: Port the approved print hierarchy**

Port the proposal block from `a-shared-itinerary-is-printed-by-daypart-v2.html`: fixed light page, compact two-column Full layout, non-empty daypart headings, break-safe day/event rows, generated-at time, page count, written live URL, and a real QR generated from that same URL. The nine-day reference Summary must remain one page and Full two pages; Everything fields render in a labelled appendix. Do not copy mockup chrome or the checkered QR placeholder.

- [ ] **Step 5: Add runtime Chromium and a smoke check**

In the Docker runtime stage, install `chromium` alongside certificates/openssl and copy the existing Assistant font files from the build stage to `/app/pdf-fonts`. `backend/src/sharing/pdf-container-smoke.ts` launches `/usr/bin/chromium` through the real service, renders the nine-day Full fixture, and writes the result to the path passed in `process.argv[2]`. `scripts/verify-pdf-smoke.mjs` opens that artifact with `pdfjs-dist` and asserts two pages, `%PDF-`, extractable `Travelive`, extractable Hebrew text, and the written public URL. Add a dedicated CI step that builds the production image, bind-mounts an output directory, runs the compiled smoke entrypoint, and verifies the resulting file on the host; the implementation PR cannot rely only on a mocked browser spec.

- [ ] **Step 6: Run PDF verification**

Run:

```bash
pnpm --filter @waypoint/backend exec vitest run src/sharing/itinerary-pdf.template.spec.ts src/sharing/pdf-browser.service.spec.ts
docker build -t waypoint-sharing-pdf .
mkdir -p tmp/pdf-smoke
docker run --rm -v "$PWD/tmp/pdf-smoke:/out" --entrypoint node waypoint-sharing-pdf dist/sharing/pdf-container-smoke.js /out/sample.pdf
node scripts/verify-pdf-smoke.mjs tmp/pdf-smoke/sample.pdf
```

Expected: unit PASS; smoke prints `pages=2`, `pdf-header=pass`, `hebrew-text=pass`, `external-requests=0`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/sharing backend/package.json package.json pnpm-lock.yaml
git add Dockerfile .env.example scripts/verify-pdf-smoke.mjs .github/workflows/ci.yml
git commit -m "feat(sharing): render compact itinerary PDFs"
```

---

### Task 9: Browser contract, security regression, and responsive evidence

**Files:**

- Create: `frontend/e2e/shared-itinerary.spec.ts`
- Modify: `frontend/e2e/boot.ts`
- Test: `backend/src/throttler.e2e.spec.ts`
- Test: `backend/src/sharing/sharing-projection.service.spec.ts`

**Interfaces:**

- Adds mocked public projection/PDF routes to the hermetic e2e boot server.
- Tests 360px and 390px widths in dev and production-preview CI legs.

- [ ] **Step 1: Add e2e scenarios**

```ts
test('anonymous Summary stays readable and private facts stay absent', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/s/7Kq2mB9x');
  await expect(page.getByRole('heading', { name: 'איסלנד עם המשפחה' })).toBeVisible();
  await expect(page.getByText('בוקר')).toBeVisible();
  await expect(page.getByText('09:30')).toHaveCount(0);
  await expect(page.getByText('ABC-1234')).toHaveCount(0);
});

test('PDF action produces a shareable file or download fallback', async ({ page }) => {
  await page.goto('/trips');
  await page.getByRole('button', { name: t.share.entry }).first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: t.share.actions.pdf }).click();
  await expect(await download).toBeTruthy();
});
```

Add companion scenarios for Full, Everything with exactly one enabled family, revoked code, stale-in-memory retry, dark theme, collapsed/expanded days, and 390px. Query translated controls through `t.*`, not duplicated literals.

- [ ] **Step 2: Add public abuse/privacy regressions**

Extend throttler coverage to prove the public JSON and PDF routes return 429 at their configured limit without affecting authenticated sync burst policy. Add a projection fixture containing emails, phone numbers, URLs, confirmation codes, notes, document titles, traveler names, and coordinates; assert each appears only in its explicitly permitted destination and never in `SummaryNarrativeInput`.

- [ ] **Step 3: Run both browser modes and backend security specs**

Run:

```bash
pnpm --filter @waypoint/backend exec vitest run src/sharing src/throttler.e2e.spec.ts
pnpm --filter @waypoint/frontend exec playwright test e2e/shared-itinerary.spec.ts
E2E_PREVIEW=1 pnpm --filter @waypoint/frontend exec playwright test e2e/shared-itinerary.spec.ts
```

Expected: PASS in dev and production-preview modes, with no console errors and no horizontal overflow at either width.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/shared-itinerary.spec.ts frontend/e2e/boot.ts
git add backend/src/throttler.e2e.spec.ts backend/src/sharing/sharing-projection.service.spec.ts
git commit -m "test(sharing): cover public privacy PDF and mobile flows"
```

---

### Task 10: Current-state documentation and backlog closure

**Files:**

- Modify: `docs/decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md`
- Modify: `docs/planning/2026-08-29-itinerary-sharing.md`
- Modify: `docs/architecture/api-contract.md`
- Modify: `docs/architecture/data-model.md`
- Modify: `docs/architecture/deployment.md`
- Modify: `docs/engineering/prerequisites-checklist.md`
- Modify: `docs/design/mockups.md`
- Modify: `docs/backlog.md`
- Modify: `docs/INDEX.md`

**Interfaces:** none; this task records the built behavior and removes only the backlog work actually completed.

- [ ] **Step 1: Amend ADR-0213 with build decisions**

Set status to Accepted/built and record: one active link per trip, admin-owned mutation/member-readable reuse, four Everything families, no persistent public cache, disabled external generator, Chromium runtime/concurrency, and real QR generation. Keep rejected mockup rounds as dated evidence.

- [ ] **Step 2: Update architecture contracts**

Document all authenticated/public endpoints, bearer-code trust model, response headers, Prisma rows/relations, runtime Chromium dependency, PDF limits, and the narrative allowlist. Add the three optional PDF env vars to deployment/reference docs with defaults and kill/recovery behavior.

- [ ] **Step 3: Close the backlog line precisely**

Delete the itinerary-sharing build line when all prior tasks are merged. Add separate backlog lines only for deliberately unbuilt follow-ons: multiple audience links/access management and a configured external/local narrative provider. Do not keep completed v1 work as a status line.

- [ ] **Step 4: Run documentation and repository verification**

Run:

```bash
pnpm format
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm lint
```

Then run both `shared-itinerary.spec.ts` browser modes and the PDF container smoke from Tasks 8-9.

Expected: every command exits 0; no mockup/catalog/ADR link is broken; `git diff --check` is empty.

- [ ] **Step 5: Commit**

```bash
git add docs .env.example
git commit -m "docs(sharing): record the built sharing contract"
```

---

## Final Acceptance Checklist

- [ ] Anonymous `/s/<code>` opens without login; unknown, revoked, or rotated codes disclose no trip existence beyond the same unavailable response.
- [ ] Summary, Full, and Everything are server projections, not client-hidden fields.
- [ ] Daypart boundaries pass in UTC and non-UTC display zones; empty sections never render.
- [ ] Everything starts with all four private families off; selected files are individually scoped.
- [ ] A future model receives only strict `SummaryNarrativeInput`; Full/Everything cannot widen it.
- [ ] Model disabled/failure/staleness never blocks public HTML or PDF.
- [ ] Share entry exists in the trip header and on every All Trips card; the normal path is preset then outcome.
- [ ] Native system share works where supported, with clipboard/download fallbacks and no error on user cancellation.
- [ ] PDF is fixed-light A4, two pages for the reference Full trip, break-safe, and contains a real QR matching its written URL.
- [ ] Public responses are no-store, no-referrer, and noindex; the service worker never persists them.
- [ ] Dev and production-preview e2e pass at 360px and 390px in both themes without console errors or overflow.
- [ ] Production container PDF smoke passes with system Chromium and zero external template requests.
- [ ] ADR, planning note, architecture docs, catalog, index, and backlog describe the shipped state.

## Required Execution Order

Execute Tasks 1-5 before either UI output. Task 6 may then proceed in parallel with Task 8; Task 7 consumes the management/PDF APIs, Task 9 gates both outputs, and Task 10 runs only after every implementation acceptance item passes. Use a fresh reviewer after Tasks 3, 5, 7, and 9 because each boundary can independently leak data or duplicate an app mechanism.
