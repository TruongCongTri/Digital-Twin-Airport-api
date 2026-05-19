/**
 * @file pagination.dto.ts
 * @description Data Transfer Objects (DTOs) for pagination.
 * Handles both the validation of incoming queries and the formatting of outgoing metadata.
 * @module Common/DTOs
 */
import { z } from 'zod';
import { APP_CONFIG } from '@/constants/app.constant';

// 1. REQUEST SCHEMA (Zod)

/**
 * @schema paginationQuerySchema
 * @description Validates incoming pagination parameters from URL query strings.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(APP_CONFIG.COMMON.PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(100).default(APP_CONFIG.COMMON.PAGINATION.MAX_LIMIT),
});

/**
 * @typedef {z.infer<typeof paginationQuerySchema>} PaginationQuery
 * */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// 2. RESPONSE METADATA (Class)

/**
 * @class PaginationMetaDto
 * @description Standardized shape for pagination info returned in API responses.
 */
export class PaginationMetaDto {
  /** @property {number} page - Current active page number */
  readonly page: number;
  /** @property {number} limit - Items requested per page */
  readonly limit: number;
  /** @property {number} totalItems - Total matching records in the database */
  readonly totalItems: number;
  /** @property {number} totalPages - Total calculated pages based on limit */
  readonly totalPages: number;
  /** @property {boolean} hasNextPage - True if there is a page after this one */
  readonly hasNextPage: boolean;
  /** @property {boolean} hasPrevPage - True if there is a page before this one */
  readonly hasPrevPage: boolean;

  constructor(
    page: number,
    limit: number,
    totalItems: number,
    totalPages: number,
    hasNextPage: boolean,
    hasPrevPage: boolean
  ) {
    this.page = page;
    this.limit = limit;
    this.totalItems = totalItems;
    this.totalPages = totalPages;
    this.hasNextPage = hasNextPage;
    this.hasPrevPage = hasPrevPage;
  }

  /**
   * @method create
   * @description Factory method to create metadata from Page/Limit/Total.
   */
  static create(
    currentPage: number | string,
    perPage: number | string,
    total: number | string
  ): PaginationMetaDto {
    const page = Math.max(1, Number(currentPage) || 1);
    const limit = Math.max(1, Number(perPage) || 10);
    const totalItems = Math.max(0, Number(total) || 0);

    const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 0;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return new PaginationMetaDto(page, limit, totalItems, totalPages, hasNextPage, hasPrevPage);
  }

  /**
   * @method fromOffset
   * @description Factory method to convert Prisma's skip/take into Page/Limit metadata.
   */
  static fromOffset(
    skip: number | string,
    take: number | string,
    total: number | string
  ): PaginationMetaDto {
    const s = Math.max(0, Number(skip) || 0);
    const limit = Math.max(1, Number(take) || 10);
    const totalItems = Math.max(0, Number(total) || 0);

    const page = Math.floor(s / limit) + 1;
    const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 0;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return new PaginationMetaDto(page, limit, totalItems, totalPages, hasNextPage, hasPrevPage);
  }
}
