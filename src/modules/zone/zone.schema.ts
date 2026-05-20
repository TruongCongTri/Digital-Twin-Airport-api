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
 * @description Validates incoming payload for creating a new score event.
 *
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

export const getZonesQuerySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(ZONE_TYPES).optional(),
    // Coerce is necessary because GET query parameters arrive as strings
    floorLevel: z.coerce.number().int().optional(),
  }),
});

export type CreateZoneDTO = z.infer<typeof createZoneSchema>['body'];
export type UpdateZoneDTO = z.infer<typeof updateZoneSchema>['body'];
export type GetZonesQuery = z.infer<typeof getZonesQuerySchema>['query'];
