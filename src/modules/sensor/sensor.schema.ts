import { z } from 'zod';
import { MESSAGES } from '@/constants/messages';
import { FIELDS } from '@/constants/fields';
import { paginationSchema } from '@/common/schemas/reusable.schema';

// Extracted from Prisma Enums to ensure Zod strictly validates incoming payloads
export const SENSOR_TYPES: [string, ...string[]] = [
  'CO2',
  'TEMPERATURE',
  'HUMIDITY',
  'WIND_INDOOR',
  'WIND_OUTDOOR',
  'TILT_STRUCTURAL',
  'LIGHT_DENSITY',
  'TARMAC_TEMP',
  'CAMERA_AI_CROWD',
];

export const SENSOR_STATUSES: [string, ...string[]] = [
  'ACTIVE',
  'WARNING',
  'CRITICAL',
  'MAINTENANCE',
  'CALIBRATING',
  'OFFLINE',
  'UNREACHABLE',
];
/**
 * @schema createSensorSchema
 * @description Validates incoming payload for creating a new IoT sensor mapped in ArcGIS.
 */
export const createSensorSchema = z.object({
  body: z.object({
    name: z
      .string({ message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.TITLE) })
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED(FIELDS.TITLE) }),

    type: z.enum(SENSOR_TYPES, {
      message: MESSAGES.VALIDATION.INVALID_ENUM(FIELDS.TYPE),
    }),

    status: z
      .enum(SENSOR_STATUSES, {
        message: MESSAGES.VALIDATION.INVALID_ENUM(FIELDS.STATUS),
      })
      .optional(),

    x: z.number({
      message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.X),
    }),

    y: z.number({
      message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.Y),
    }),

    z: z.number({
      message: MESSAGES.VALIDATION.ONLY_NUMBERS(FIELDS.Z),
    }),

    zoneId: z
      .string({
        message: MESSAGES.VALIDATION.MUST_BE_STRING(FIELDS.ZONE),
      })
      .uuid({ message: MESSAGES.VALIDATION.INVALID_UUID(FIELDS.ZONE) }),
  }),
});

/**
 * @schema updateSensorSchema
 * @description Validates partial payloads for updating a sensor's metadata or status.
 *
 */
export const updateSensorSchema = z.object({
  body: createSensorSchema.shape.body.partial(),
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .trim()
      .uuid({ message: MESSAGES.VALIDATION.INVALID_FORMAT(FIELDS.ID) }),
  }),
});

/**
 * @schema getSensorsQuerySchema
 * @description Validates the query parameters for filtering sensors (e.g., ?type=CO2&status=ACTIVE)
 */
export const getSensorsQuerySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(SENSOR_TYPES).optional(),
    status: z.enum(SENSOR_STATUSES).optional(),
    zoneId: z.string().uuid().optional(),
  }),
});

/**
 * @schema getSensorHistoryQuerySchema
 * @description Validates query parameters for fetching time-series logs.
 * Includes optional date filtering for charting libraries.
 */
export const getSensorHistoryQuerySchema = z.object({
  query: paginationSchema
    .extend({
      startDate: z.string().datetime({ message: 'startDate must be a valid ISO Date' }).optional(),
      endDate: z.string().datetime({ message: 'endDate must be a valid ISO Date' }).optional(),
      type: z.enum(SENSOR_TYPES).optional(),
      zoneId: z.string().uuid().optional(),
    })
    .refine(
      (data) => {
        // If both dates are provided, ensure the range is <= 7 days (604,800,000 milliseconds)
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate).getTime();
          const end = new Date(data.endDate).getTime();

          // Also ensure startDate is before endDate
          if (start > end) return false;

          return end - start <= 604800000;
        }
        return true;
      },
      {
        message: 'Date range invalid or exceeds the maximum 7-day limit.',
        path: ['endDate'], // The error will be attached to the endDate field in the API response
      }
    ),
});

export type CreateSensorDTO = z.infer<typeof createSensorSchema>['body'];
export type UpdateSensorDTO = z.infer<typeof updateSensorSchema>['body'];
export type GetSensorsQuery = z.infer<typeof getSensorsQuerySchema>['query'];
export type GetSensorHistoryQuery = z.infer<typeof getSensorHistoryQuerySchema>['query'];
