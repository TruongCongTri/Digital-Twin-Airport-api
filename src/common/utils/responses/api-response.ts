/**
 * @file api-response.ts
 * @description Standardized API response wrappers for the Express framework.
 * Ensures consistent JSON structure across all successful and error states.
 * @module Common/Utils
 */
import { Response } from 'express';
import { PaginationMetaDto } from '../../../data/dtos/pagination.dto';

/**
 * @interface ValidationErrorDetail
 * @description Structure for granular validation errors (usually from Zod).
 */
export interface ValidationErrorDetail {
  field: string | number;
  message: string;
  code?: string;
}

export type ApiErrorData = string | string[] | ValidationErrorDetail[] | Record<string, unknown>;

// INTERNAL RESPONSE INTERFACES

interface BaseMeta {
  success: boolean;
  message: string;
}

interface SuccessMeta extends BaseMeta {
  success: true;
  pagination?: PaginationMetaDto;
}

interface ErrorMeta extends BaseMeta {
  success: false;
  error_code?: string | number;
  errors?: ApiErrorData;
}

interface SuccessResponseBody<T> {
  meta: SuccessMeta;
  data?: T;
}

interface ErrorResponseBody {
  meta: ErrorMeta;
}

// EXPORTED FACTORY METHODS

/**
 * @method successResponse
 * @description Standard wrapper for successful requests.
 * @note The 'data' key is inserted before 'meta' to prioritize rendering order in clients.
 */
export const successResponse = <T>(
  res: Response,
  {
    message,
    data,
    meta,
    statusCode = 200,
  }: {
    message: string;
    data?: T;
    meta?: PaginationMetaDto;
    statusCode?: number;
  }
): Response<SuccessResponseBody<T>> => {
  const responseBody: SuccessResponseBody<T> = {
    ...(data !== undefined && { data }),
    meta: {
      success: true,
      message,
      ...(meta !== undefined && { pagination: meta }),
    },
  };

  return res.status(statusCode).json(responseBody);
};

/**
 * @method errorResponse
 * @description Standard wrapper for failed requests.
 */
export const errorResponse = (
  res: Response,
  {
    message,
    statusCode = 400,
    error_code,
    errors,
  }: {
    message: string;
    statusCode?: number;
    error_code?: string | number;
    errors?: ApiErrorData;
  }
): Response<ErrorResponseBody> => {
  const responseBody: ErrorResponseBody = {
    meta: {
      success: false,
      message,
      ...(error_code !== undefined && { error_code }),
      ...(errors !== undefined && { errors }),
    },
  };

  return res.status(statusCode).json(responseBody);
};
