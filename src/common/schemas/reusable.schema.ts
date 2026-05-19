/**
 * @file reusable.schema.ts
 * @description Centralized Zod validation schemas for cross-module use.
 * This file contains base pagination, resource filtering, and common parameter schemas (Slug, ID).
 * @module Common/Schemas
 */
import { z } from 'zod';
import { MESSAGES } from '@/constants/messages';
import { FIELDS } from '@/constants/fields';
import { APP_CONFIG, SORT_OPTIONS, TIMEFRAME_OPTIONS } from '@/constants/app.constant';

/**
 * @constant SLUG_REGEX
 * @description Validates e-commerce slugs: lowercase alphanumeric segments separated by hyphens,
 * ending with a 13-digit Unix timestamp (e.g., "cool-product-name-1712345678901").
 */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{13}$/;

// 1. BASE UTILITY SCHEMAS

/**
 * @schema paginationSchema
 * @description Standardized pagination validation. Coerces URL strings into integers.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(APP_CONFIG.COMMON.PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(APP_CONFIG.COMMON.PAGINATION.MAX_LIMIT)
    .default(APP_CONFIG.COMMON.PAGINATION.DEFAULT_LIMIT),
});

/**
 * @schema getIDSchema
 * @description Validates a single UUID identifier passed in request parameters.
 */
export const getProductsQuerySchema = z.object({
  query: paginationSchema
    .extend({
      search: z.string().trim().optional(),
      categorySlug: z.string().trim().optional(),
      sellerSlug: z.string().trim().optional(),

      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),

      sortBy: z.enum(SORT_OPTIONS.PRODUCT).default(SORT_OPTIONS.PRODUCT[0]), // newest
      timeframe: z.enum(TIMEFRAME_OPTIONS).optional(),
    })
    .refine(
      (data) => {
        if (data.minPrice !== undefined && data.maxPrice !== undefined) {
          return data.minPrice <= data.maxPrice;
        }
        return true;
      },
      { message: MESSAGES.VALIDATION.MIN_VALUE_INVALID(FIELDS.PRICE), path: [FIELDS.PRICE] }
    ),
});

/**
 * @schema getSlugSchema
 * @description Validates a resource slug passed in request parameters using SLUG_REGEX.
 */
export const getSlugSchema = z.object({
  params: z.object({
    slug: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.SLUG) })
      .trim()
      .regex(SLUG_REGEX, { message: MESSAGES.VALIDATION.INVALID_FORMAT(FIELDS.SLUG) }),
  }),
});

/**
 * @schema getIDSchema
 * @description Validates a single UUID identifier passed in request parameters.
 */
export const getIDSchema = z.object({
  params: z.object({
    id: z
      .string({ message: MESSAGES.VALIDATION.REQUIRED(FIELDS.ID) })
      .trim()
      .uuid({ message: MESSAGES.VALIDATION.INVALID_FORMAT(FIELDS.ID) }),
  }),
});
