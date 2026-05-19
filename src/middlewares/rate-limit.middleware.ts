/**
 * @file rate-limit.middleware.ts
 * @description Traffic control middleware to prevent API abuse.
 * Configures window-based request limits using centralized APP_CONFIG.
 * @module Middlewares/RateLimit
 */
import rateLimit from 'express-rate-limit';
import { APP_CONFIG } from '../constants/app.constant';
import { MESSAGES } from '../constants/messages';
import { ERROR_CODES } from '../constants/error-codes';

/**
 * @constant apiLimiter
 * @description General protection for all endpoints to prevent resource exhaustion.
 */
export const apiLimiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMIT.API_WINDOW_MINUTES * 60 * 1000,
  max: APP_CONFIG.RATE_LIMIT.API_MAX_REQUESTS,
  message: {
    success: false,
    message: MESSAGES.RATE_LIMIT.API_SPAM(APP_CONFIG.RATE_LIMIT.API_WINDOW_MINUTES),
    error_code: ERROR_CODES.RATE_LIMIT.TOO_MANY_REQUESTS,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @constant authLimiter
 * @description Strict protection for sensitive routes (Login, OTP, Password Reset).
 */
export const authLimiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMIT.AUTH_WINDOW_MINUTES * 60 * 1000,
  max: APP_CONFIG.RATE_LIMIT.AUTH_MAX_REQUESTS,
  message: {
    success: false,
    message: MESSAGES.RATE_LIMIT.AUTH_SPAM(APP_CONFIG.RATE_LIMIT.AUTH_WINDOW_MINUTES),
    error_code: ERROR_CODES.RATE_LIMIT.TOO_MANY_REQUESTS,
  },
  standardHeaders: true,
  legacyHeaders: false,
});
