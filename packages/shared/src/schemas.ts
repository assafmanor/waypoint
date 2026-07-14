// Zod schemas shared by client and server — one definition validates both ends.
// Used for API request validation (backend) and form/optimistic-write validation (frontend).

import { z } from 'zod';
import {
  bookingTypeSchema,
  eventKindSchema,
  eventSourceSchema,
  eventStatusSchema,
} from './entities';

/** Client-generated id (cuid/uuid). Server validates format only. ADR-0018. */
// ponytail: charset+length guard, tighten to exact cuid2/uuid grammar if it ever matters.
export const entityIdSchema = z.string().regex(/^[a-z0-9-]{8,64}$/i, 'invalid id format');

const eventFieldsSchema = z.object({
  id: entityIdSchema.optional(),
  date: z.string(), // ISO date (YYYY-MM-DD)
  endDate: z.string().optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  kind: eventKindSchema,
  startsAt: z.string().optional(), // UTC instant
  endsAt: z.string().optional(),
  location: z.string().optional(),
  placeId: z.string().optional(),
  bookingId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  source: eventSourceSchema.default('manual'),
});

/** Client and server both reject an inverted/zero-duration span — enforced once
 *  here rather than separately on each end (ADR-0023). */
const endAfterStart = (data: { startsAt?: string; endsAt?: string }) =>
  !data.startsAt || !data.endsAt || Date.parse(data.endsAt) > Date.parse(data.startsAt);
const endAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

/** Payload to create an event. Client supplies `id`; server assigns updatedBy/timestamps. */
export const createEventSchema = eventFieldsSchema.refine(endAfterStart, endAfterStartIssue);
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Partial update to an event. Hard events require confirmation server-side (ADR-0011). */
export const updateEventSchema = eventFieldsSchema
  .partial()
  .extend({ status: eventStatusSchema.optional() })
  .refine(endAfterStart, endAfterStartIssue);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Move an event to another date/time/order. ADR-0018 (no dayId). */
export const moveEventSchema = z.object({
  date: z.string().optional(),
  startsAt: z.string().optional(),
  sortOrder: z.number().int().optional(),
});
export type MoveEventInput = z.infer<typeof moveEventSchema>;

/** Set an event's status (done/skipped). */
export const eventStatusUpdateSchema = z.object({ status: eventStatusSchema });
export type EventStatusUpdateInput = z.infer<typeof eventStatusUpdateSchema>;

export const createBookingSchema = z.object({
  id: entityIdSchema.optional(),
  type: bookingTypeSchema,
  title: z.string().min(1),
  confirmationCode: z.string().optional(),
  provider: z.string().optional(),
  address: z.string().optional(),
  placeId: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Partial update to a booking. */
export const updateBookingSchema = createBookingSchema.partial();
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export const createTripSchema = z.object({
  name: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string().default('UTC'),
  currency: z.string().optional(),
  dailyBudgetMinor: z.number().int().optional(),
});
export type CreateTripInput = z.infer<typeof createTripSchema>;

export const createMaybeItemSchema = z.object({
  id: entityIdSchema.optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  placeId: z.string().optional(),
});
export type CreateMaybeItemInput = z.infer<typeof createMaybeItemSchema>;

/** `POST /trips/:tripId/invite` response. */
export const inviteUrlSchema = z.object({ inviteUrl: z.string() });
export type InviteUrl = z.infer<typeof inviteUrlSchema>;

/** `GET /invites/:token` response — public preview shown before joining (ADR-0024). */
export const invitePreviewSchema = z.object({
  tripName: z.string(),
  destination: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  memberCount: z.number().int(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** `POST /auth/refresh` response — the access JWT lives in memory client-side, never a cookie (ADR-0020). */
export const accessTokenResponseSchema = z.object({ accessToken: z.string() });
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

/** `PATCH /trips/:tripId/members/me` — a member's own consent flags (self-only, ADR-0005). */
export const updateMembershipPrefsSchema = z.object({ calendarSyncEnabled: z.boolean() });
export type UpdateMembershipPrefsInput = z.infer<typeof updateMembershipPrefsSchema>;

/** `POST /trips/join/:token` body — same field, optional (defaults to the Prisma column default). */
export const joinTripSchema = updateMembershipPrefsSchema.partial();
export type JoinTripInput = z.infer<typeof joinTripSchema>;
