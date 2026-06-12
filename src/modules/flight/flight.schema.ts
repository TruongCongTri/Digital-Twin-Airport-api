import { z } from 'zod';
import { MESSAGES } from '@/constants/messages';
import { FIELDS } from '@/constants/fields';
import { paginationSchema } from '@/common/schemas/reusable.schema';

export const FLIGHT_STATUSES = [
  'SCHEDULED',
  'DELAYED',
  'APPROACHING',
  'LANDED',
  'TAXIING',
  'PARKED',
  'BOARDING',
  'PUSHBACK',
  'DEPARTED',
  'DIVERTED',
  'CANCELLED',
] as const;

/**
 * @schema createFlightSchema
 * @description Validates incoming payload for creating a new scheduled flight.
 */
export const createFlightSchema = z.object({
  body: z.object({
    flightNumber: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.FLIGHT_NUMBER) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.FLIGHT_NUMBER) }),
    airline: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.AIRLINE) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.AIRLINE) }),
    origin: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.ORIGIN) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ORIGIN) }),
    destination: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.DESTINATION) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.DESTINATION) }),
    airportId: z
      .string({ message: 'Airport ID must be a string' })
      .uuid({ message: 'Invalid Airport ID format' }),
  }),
});

/**
 * @schema updateFlightStatusSchema
 * @description Validates state transitions (e.g., TAXIING -> PARKED).
 */
export const updateFlightStatusSchema = z.object({
  body: z.object({
    status: z.enum(FLIGHT_STATUSES, {
      message: MESSAGES.VALIDATION.INVALID_ENUM(FIELDS.STATUS),
    }),
  }),
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .uuid({ message: MESSAGES.VALIDATION.INVALID_UUID(FIELDS.ID) }),
  }),
});

/**
 * @schema allocateParkingSchema
 * @description Validates assigning an aircraft to a specific gate or tarmac stand.
 */
export const allocateParkingSchema = z.object({
  body: z.object({
    parkingStandId: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.PARKING_STAND) })
      .uuid({ message: MESSAGES.VALIDATION.INVALID_UUID(FIELDS.PARKING_STAND) }),
  }),
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .uuid({ message: MESSAGES.VALIDATION.INVALID_UUID(FIELDS.ID) }),
  }),
});

/**
 * @schema addTelemetrySchema
 * @description Validates the high-frequency GPS data used to move the 3D model in ArcGIS.
 */
export const addTelemetrySchema = z.object({
  body: z.object({
    longitude: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.LONGITUDE) }),
    latitude: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.LATITUDE) }),
    altitude: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.ALTITUDE) }),
    heading: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.HEADING) }),
    speed: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.SPEED) }),
  }),
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .uuid({ message: MESSAGES.VALIDATION.INVALID_UUID(FIELDS.ID) }),
  }),
});

/**
 * @schema getFlightsQuerySchema
 * @description Validates query parameters for filtering flights in the dispatcher UI.
 */
export const getFlightsQuerySchema = z.object({
  query: paginationSchema.extend({
    status: z.enum(FLIGHT_STATUSES).optional(),
    airline: z.string().optional(),
    airportId: z.string().optional(), // Accepts "VVLT", "VVTS", or UUID
  }),
});

/**
 * @schema getStaticFlightsQuerySchema
 * @description Validates query parameters for fetching static flights mapped in ArcGIS.
 */
export const getStaticFlightsQuerySchema = z.object({
  query: z.object({
    airportId: z.string().optional(), // Accepts "VVLT", "VVTS", or UUID
  }),
});

// Infer TypeScript types directly from the strictly validated Zod schemas
export type CreateFlightDTO = z.infer<typeof createFlightSchema>['body'];
export type UpdateFlightStatusDTO = z.infer<typeof updateFlightStatusSchema>['body'];
export type AllocateParkingDTO = z.infer<typeof allocateParkingSchema>['body'];
export type AddTelemetryDTO = z.infer<typeof addTelemetrySchema>['body'];
export type GetFlightsQuery = z.infer<typeof getFlightsQuerySchema>['query'];
export type GetStaticFlightsQuery = z.infer<typeof getStaticFlightsQuerySchema>['query'];
