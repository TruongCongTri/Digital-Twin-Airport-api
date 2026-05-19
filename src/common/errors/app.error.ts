/**
 * @class AppError
 * @extends Error
 * @description A custom error class designed to handle operational errors.
 * It attaches HTTP status codes and internal error codes to standard JavaScript Error objects.
 */
import { ErrorCode } from '../../constants/error-codes';

export class AppError extends Error {
  /** @property {number} statusCode - The HTTP status code (e.g., 400, 404, 500) */
  public readonly statusCode: number;
  /** @property {string | number} errorCode - An internal, human-readable error identifier */
  public readonly errorCode?: string | number;

  /**
   * @param {number} statusCode - HTTP Status Code
   * @param {string} message - Error Message
   * @param {ErrorCode} [errorCode] - Optional internal error code for client-side mapping
   */
  constructor(statusCode: number, message: string, errorCode?: ErrorCode) {
    super(message);
    this.statusCode = statusCode;

    if (errorCode !== undefined) {
      this.errorCode = errorCode;
    }

    /**
     * Ensures that the stack trace reflects where the error was actually thrown,
     * rather than where the AppError class was defined.
     */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
