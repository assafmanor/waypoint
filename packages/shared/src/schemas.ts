// Zod schemas shared by client and server — one definition validates both ends.
// Used for API request validation (backend) and form/optimistic-write validation (frontend).

import { z } from 'zod';

export const eventKindSchema = z.enum(['hard', 'soft']);
export const eventStatusSchema = z.enum(['planned', 'now', 'done', 'skipped']);
export const eventSourceSchema = z.enum(['manual', 'gmail', 'maybe_shelf', 'integration']);
export const bookingTypeSchema = z.enum([
  'flight',
  'hotel',
  'restaurant',
  'train',
  'activity',
  'other',
]);

/** Payload to create an event. Server assigns id/status/updatedBy/updatedAt. */
export const createEventSchema = z.object({
  dayId: z.string(),
  title: z.string().min(1),
  icon: z.string().optional(),
  kind: eventKindSchema,
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  placeId: z.string().optional(),
  bookingId: z.string().optional(),
  source: eventSourceSchema.default('manual'),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Partial update to an event. Hard events require confirmation server-side (ADR-0011). */
export const updateEventSchema = createEventSchema.partial().extend({
  status: eventStatusSchema.optional(),
  sortOrder: z.number().optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const createBookingSchema = z.object({
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

export const createTripSchema = z.object({
  name: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string().default('UTC'),
});
export type CreateTripInput = z.infer<typeof createTripSchema>;
