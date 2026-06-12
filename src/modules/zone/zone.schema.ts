import { z } from 'zod';
import { MESSAGES } from '@/constants/messages';
import { FIELDS } from '@/constants/fields';
import { paginationSchema } from '@/common/schemas/reusable.schema';

export const ZONE_TYPES = [
  'CHECK_IN',
  'SECURITY_GATE',
  'BOARDING_GATE',
  'RETAIL',
  'BAGGAGE_CLAIM',
  'APRON',
] as const;

/**
 * @schema createZoneSchema
 * @description Validates incoming payload for creating a new terminal spatial zone.
 */
export const createZoneSchema = z.object({
  body: z.object({
    name: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.ZONE_NAME) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ZONE_NAME) }),

    type: z.enum(ZONE_TYPES, {
      message: MESSAGES.VALIDATION.INVALID_ENUM(FIELDS.ZONE_TYPE),
    }),

    floorLevel: z.number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.FLOOR_LEVEL) }).int(),

    maxCapacity: z
      .number({ message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.MAX_CAPACITY) })
      .int()
      .positive(),

    // Optional GIS identifiers for the ArcGIS 3D mapping
    gisItemId: z
      .string()
      .length(32, { message: 'ArcGIS Item ID must be exactly 32 characters.' })
      .regex(/^[a-fA-F0-9]+$/, { message: 'ArcGIS Item ID must be a valid hexadecimal string.' })
      .optional(),
    gisSceneUrl: z.string().url().optional(),

    airportId: z
      .string({ message: 'Airport ID must be a string' })
      .uuid({ message: 'Invalid Airport ID format' }),
  }),
});

/**
 * @schema updateZoneSchema
 * @description Validates partial payloads for update.
 */
export const updateZoneSchema = z.object({
  body: createZoneSchema.shape.body.partial(),
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .trim()
      .uuid({ message: MESSAGES.VALIDATION.INVALID_FORMAT(FIELDS.ID) }),
  }),
});

/**
 * @schema getZonesQuerySchema
 * @description Validates query parameters for filtering terminal zones.
 */
export const getZonesQuerySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(ZONE_TYPES).optional(),
    floorLevel: z.coerce.number().int().optional(),
    airportId: z.string().optional(), // Accepts raw UUID or ICAO code
  }),
});

/**
 * @schema getStaticZonesQuerySchema
 * @description Validates incoming query params for fetching skeletal drop-down options.
 */
export const getStaticZonesQuerySchema = z.object({
  query: z.object({
    airportId: z.string().optional(), // Accepts raw UUID or ICAO code
  }),
});

export type CreateZoneDTO = z.infer<typeof createZoneSchema>['body'];
export type UpdateZoneDTO = z.infer<typeof updateZoneSchema>['body'];
export type GetZonesQuery = z.infer<typeof getZonesQuerySchema>['query'];
export type GetStaticZonesQuery = z.infer<typeof getStaticZonesQuerySchema>['query'];
